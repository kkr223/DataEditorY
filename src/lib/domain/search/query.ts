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

function splitSearchTerms(input: string) {
  return input
    .split(/(?:%%|\s+)/)
    .map((item) => item.trim())
    .filter(Boolean);
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

export function buildSearchQuery(filters: SearchFilters = {}): CardSearchQuery {
  const conditions: string[] = [];
  const params: Record<string, string | number> = {};

  if (filters.name) {
    const keywords = splitSearchTerms(filters.name);
    if (keywords.length > 0) {
      const keywordConditions = keywords.map((keyword, index) => {
        const key = `name${index}`;
        params[key] = toLikePattern(keyword);
        return `texts.name LIKE :${key}`;
      });
      conditions.push(`(${keywordConditions.join(' AND ')})`);
    }
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
    const keywords = splitSearchTerms(filters.desc);
    if (keywords.length > 0) {
      const keywordConditions = keywords.map((keyword, index) => {
        const key = `desc${index}`;
        params[key] = toLikePattern(keyword);
        return `texts.desc LIKE :${key}`;
      });
      conditions.push(`(${keywordConditions.join(' AND ')})`);
    }
  }

  if (filters.atkMin !== '' && filters.atkMin !== undefined) {
    const value = parseInt(filters.atkMin.toString(), 10);
    if (!isNaN(value)) {
      pushNumericCondition(conditions, params, 'atkMin', value, (placeholder) => `datas.atk >= ${placeholder}`);
    }
  }
  if (filters.atkMax !== '' && filters.atkMax !== undefined) {
    const value = parseInt(filters.atkMax.toString(), 10);
    if (!isNaN(value)) {
      pushNumericCondition(conditions, params, 'atkMax', value, (placeholder) => `datas.atk <= ${placeholder}`);
    }
  }
  if (filters.defMin !== '' && filters.defMin !== undefined) {
    const value = parseInt(filters.defMin.toString(), 10);
    if (!isNaN(value)) {
      pushNumericCondition(conditions, params, 'defMin', value, (placeholder) => `datas.def >= ${placeholder}`);
    }
  }
  if (filters.defMax !== '' && filters.defMax !== undefined) {
    const value = parseInt(filters.defMax.toString(), 10);
    if (!isNaN(value)) {
      pushNumericCondition(conditions, params, 'defMax', value, (placeholder) => `datas.def <= ${placeholder}`);
    }
  }

  const hasMonsterOnlyFilter =
    (filters.atkMin !== '' && filters.atkMin !== undefined) ||
    (filters.atkMax !== '' && filters.atkMax !== undefined) ||
    (filters.defMin !== '' && filters.defMin !== undefined) ||
    (filters.defMax !== '' && filters.defMax !== undefined) ||
    (filters.attribute ?? '') !== '' ||
    (filters.race ?? '') !== '';

  if (hasMonsterOnlyFilter && filters.type && filters.type !== 'monster') {
    conditions.push('1=0');
  }

  if (filters.type && TYPE_MAP[filters.type] !== undefined) {
    const typeBit = TYPE_MAP[filters.type];
    pushNumericCondition(conditions, params, 'typeBit', typeBit, (placeholder) => `(datas.type & ${placeholder}) = ${placeholder}`);
  }

  if (filters.subtype) {
    if (filters.subtype === 'normal' && filters.type === 'spell') {
      pushNumericCondition(conditions, params, 'spellSubtypeMask', SPELL_SUBTYPE_MASK, (placeholder) => `(datas.type & ${placeholder}) = 0`);
    } else if (filters.subtype === 'normal' && filters.type === 'trap') {
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
