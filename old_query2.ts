import type { CardSearchQuery, SearchFilters } from '$lib/types';
import {
  ATTRIBUTE_MAP,
  RACE_MAP,
  SPELL_SUBTYPE_MASK,
  SUBTYPE_MAP,
  TRAP_SUBTYPE_MASK,
  TYPE_MAP,
} from '$lib/domain/card/taxonomy';
import { parseRuleExpression } from '$lib/domain/search/ruleExpression';

function toLikePattern(input: string) {
  const normalized = input.trim();
  if (!normalized) return '%';
  const hasWildcard = normalized.includes('%') || normalized.includes('_');
  return hasWildcard ? normalized : `%${normalized}%`;
}

function buildDexNamePattern(input: string) {
  const normalized = input.trim();
  if (!normalized) return '%';

  if (normalized.includes('%%')) {
    return normalized.replaceAll('%%', '%');
  }

  const escaped = normalized
    .replaceAll('/', '//')
    .replaceAll('%', '/%')
    .replaceAll('_', '/_');

  return `%${escaped}%`;
}

const MAX_NUMERIC_ID_DIGITS = 10;
const MAX_NUMERIC_ID_VALUE = 4_294_967_295;

function buildNumericPrefixRanges(input: string) {
  const normalized = input.trim();
  if (!/^\d+$/.test(normalized)) return [];
  if (normalized.length > 1 && normalized.startsWith('0')) return [];
  if (normalized.length > MAX_NUMERIC_ID_DIGITS) return [];

  const prefixValue = Number(normalized);
  if (!Number.isSafeInteger(prefixValue) || prefixValue > MAX_NUMERIC_ID_VALUE) {
    return [];
  }

  const ranges: Array<{ start: number; end: number }> = [];
  for (let totalDigits = normalized.length; totalDigits <= MAX_NUMERIC_ID_DIGITS; totalDigits += 1) {
    const multiplier = 10 ** (totalDigits - normalized.length);
    const start = prefixValue * multiplier;
    if (start > MAX_NUMERIC_ID_VALUE) break;

    const end = Math.min((prefixValue + 1) * multiplier - 1, MAX_NUMERIC_ID_VALUE);
    ranges.push({ start, end });
  }

  return ranges;
}

export function parseSetcodeFilter(input: string): number | null {
  const normalized = input.trim();
  if (!normalized) return null;

  const hex = normalized.toLowerCase().startsWith('0x') ? normalized.slice(2) : normalized;
  if (!/^[\da-f]{1,4}$/i.test(hex)) return null;

  return parseInt(hex, 16) & 0xffff;
}

function pushNumericCondition(
  conditions: string[],
  params: Record<string, string | number>,
  key: string,
  value: number,
  buildCondition: (placeholder: string) => string,
) {
  params[key] = value;
  conditions.push(buildCondition(`:${key}`));
}

function parseOptionalInteger(value: string | number | undefined) {
  if (value === '' || value === undefined) return null;
  const normalized = value.toString().trim();
  if (!normalized) return null;
  if (normalized === '.') return -1;
  if (normalized === '?' || normalized === '??) return -2;

  const parsed = parseInt(normalized, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function pushDexStatConditions(
  conditions: string[],
  params: Record<string, string | number>,
  fieldKey: 'atk' | 'def',
  minRaw: string | number | undefined,
  maxRaw: string | number | undefined,
) {
  const minValue = parseOptionalInteger(minRaw);
  const maxValue = parseOptionalInteger(maxRaw);

  if (minValue === -2 || maxValue === -2) {
    pushNumericCondition(
      conditions,
      params,
      `${fieldKey}Unknown`,
      -2,
      (placeholder) => `datas.${fieldKey} = ${placeholder}`,
    );
    return;
  }

  if (minValue === -1 || maxValue === -1) {
    pushNumericCondition(
      conditions,
      params,
      `${fieldKey}Zero`,
      0,
      (placeholder) => `datas.${fieldKey} = ${placeholder}`,
    );
    return;
  }

  if (minValue !== null) {
    pushNumericCondition(
      conditions,
      params,
      `${fieldKey}Min`,
      minValue,
      (placeholder) => `datas.${fieldKey} >= ${placeholder}`,
    );
  }

  if (maxValue !== null) {
    pushNumericCondition(
      conditions,
      params,
      `${fieldKey}Max`,
      maxValue,
      (placeholder) => `datas.${fieldKey} <= ${placeholder}`,
    );
  }
}

function inferMainTypeFromSubtype(subtype: string | undefined) {
  if (!subtype) return '';
  if (['quickplay', 'continuous_spell', 'equip', 'field', 'ritual_spell'].includes(subtype)) {
    return 'spell';
  }
  if (['continuous_trap', 'counter'].includes(subtype)) {
    return 'trap';
  }
  if (SUBTYPE_MAP[subtype] !== undefined) {
    return 'monster';
  }
  return '';
}

export function buildSearchQuery(filters: SearchFilters = {}): CardSearchQuery {
  const conditions: string[] = [];
  const params: Record<string, string | number> = {};
  const resolvedType = filters.type || inferMainTypeFromSubtype(filters.subtype);

  if (filters.name) {
    params.name = buildDexNamePattern(filters.name);
    conditions.push(`texts.name LIKE :name ESCAPE '/'`);
  }

  if (filters.id) {
    const normalizedId = filters.id.trim();
    const prefixRanges = buildNumericPrefixRanges(normalizedId);
    if (prefixRanges.length > 0) {
      const rangeConditions = prefixRanges.map((range, index) => {
        const startKey = `idPrefixStart${index}`;
        const endKey = `idPrefixEnd${index}`;
        params[startKey] = range.start;
        params[endKey] = range.end;
        return `(datas.id BETWEEN :${startKey} AND :${endKey} OR datas.alias BETWEEN :${startKey} AND :${endKey})`;
      });
      conditions.push(`(${rangeConditions.join(' OR ')})`);
    } else {
      conditions.push('1=0');
    }
  }

  if (filters.desc) {
    params.desc = toLikePattern(filters.desc);
    conditions.push('texts.desc LIKE :desc');
  }

  pushDexStatConditions(conditions, params, 'atk', filters.atkMin, filters.atkMax);
  pushDexStatConditions(conditions, params, 'def', filters.defMin, filters.defMax);

  const hasMonsterOnlyFilter =
    (filters.atkMin !== '' && filters.atkMin !== undefined) ||
    (filters.atkMax !== '' && filters.atkMax !== undefined) ||
    (filters.defMin !== '' && filters.defMin !== undefined) ||
    (filters.defMax !== '' && filters.defMax !== undefined) ||
    (filters.attribute ?? '') !== '' ||
    (filters.race ?? '') !== '';

  if (hasMonsterOnlyFilter && resolvedType && resolvedType !== 'monster') {
    conditions.push('1=0');
  }

  if (resolvedType && TYPE_MAP[resolvedType] !== undefined) {
    const typeBit = TYPE_MAP[resolvedType];
    pushNumericCondition(conditions, params, 'typeBit', typeBit, (placeholder) => `(datas.type & ${placeholder}) = ${placeholder}`);
  }

  if (filters.subtype) {
    if (filters.subtype === 'normal' && resolvedType === 'spell') {
      pushNumericCondition(conditions, params, 'spellSubtypeMask', SPELL_SUBTYPE_MASK, (placeholder) => `(datas.type & ${placeholder}) = 0`);
    } else if (filters.subtype === 'normal' && resolvedType === 'trap') {
      pushNumericCondition(conditions, params, 'trapSubtypeMask', TRAP_SUBTYPE_MASK, (placeholder) => `(datas.type & ${placeholder}) = 0`);
    } else {
      let subtypeBit: number | undefined;
      if (filters.subtype === 'continuous_spell' || filters.subtype === 'continuous_trap') subtypeBit = 0x20000;
      else if (filters.subtype === 'ritual_spell') subtypeBit = 0x80;
      else subtypeBit = SUBTYPE_MAP[filters.subtype];
      if (subtypeBit !== undefined) {
        pushNumericCondition(conditions, params, 'subtypeBit', subtypeBit, (placeholder) => `(datas.type & ${placeholder}) = ${placeholder}`);
      }
    }
  }

  if (filters.attribute && ATTRIBUTE_MAP[filters.attribute] !== undefined) {
    pushNumericCondition(conditions, params, 'attribute', ATTRIBUTE_MAP[filters.attribute], (placeholder) => `datas.attribute = ${placeholder}`);
  }

  if (filters.race && RACE_MAP[filters.race] !== undefined) {
    pushNumericCondition(conditions, params, 'race', RACE_MAP[filters.race], (placeholder) => `datas.race = ${placeholder}`);
  }

  for (const [index, rawValue] of [filters.setcode1, filters.setcode2, filters.setcode3, filters.setcode4].entries()) {
    if (!rawValue) continue;
    const parsedSetcode = parseSetcodeFilter(rawValue);
    if (parsedSetcode === null) continue;
    pushNumericCondition(conditions, params, `setcode${index}`, parsedSetcode, (placeholder) => `(
      ((CAST(datas.setcode AS INTEGER) >> 0) & 65535) = ${placeholder}
      OR ((CAST(datas.setcode AS INTEGER) >> 16) & 65535) = ${placeholder}
      OR ((CAST(datas.setcode AS INTEGER) >> 32) & 65535) = ${placeholder}
      OR ((CAST(datas.setcode AS INTEGER) >> 48) & 65535) = ${placeholder}
    )`);
  }

  if (filters.rule) {
    const parsedRule = parseRuleExpression(filters.rule);
    if (parsedRule) {
      conditions.push(parsedRule.clause);
      Object.assign(params, parsedRule.params);
    }
  }

  return {
    whereClause: conditions.length > 0 ? conditions.join(' AND ') : '1=1',
    params,
  };
}
