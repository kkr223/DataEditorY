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

export function buildSearchQuery(filters: SearchFilters = {}): CardSearchQuery {
  const conditions: string[] = [];
  const params: Record<string, string | number> = {};

  if (filters.name) {
    const keywords = splitSearchTerms(filters.name);
    if (keywords.length > 0) {
      const keywordConditions = keywords.map((keyword, index) => {
        const key = `name${index}`;
        params[key] = toLikePattern(keyword);
        return `(texts.name LIKE :${key} OR texts.desc LIKE :${key})`;
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
    if (!isNaN(value)) conditions.push(`datas.atk >= ${value}`);
  }
  if (filters.atkMax !== '' && filters.atkMax !== undefined) {
    const value = parseInt(filters.atkMax.toString(), 10);
    if (!isNaN(value)) conditions.push(`datas.atk <= ${value}`);
  }
  if (filters.defMin !== '' && filters.defMin !== undefined) {
    const value = parseInt(filters.defMin.toString(), 10);
    if (!isNaN(value)) conditions.push(`datas.def >= ${value}`);
  }
  if (filters.defMax !== '' && filters.defMax !== undefined) {
    const value = parseInt(filters.defMax.toString(), 10);
    if (!isNaN(value)) conditions.push(`datas.def <= ${value}`);
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
    conditions.push(`(datas.type & ${typeBit}) = ${typeBit}`);
  }

  if (filters.subtype) {
    if (filters.subtype === 'normal' && filters.type === 'spell') {
      conditions.push(`(datas.type & ${SPELL_SUBTYPE_MASK}) = 0`);
    } else if (filters.subtype === 'normal' && filters.type === 'trap') {
      conditions.push(`(datas.type & ${TRAP_SUBTYPE_MASK}) = 0`);
    } else {
      let subtypeBit: number | undefined;
      if (filters.subtype === 'continuous_spell' || filters.subtype === 'continuous_trap') subtypeBit = 0x20000;
      else if (filters.subtype === 'ritual_spell') subtypeBit = 0x80;
      else subtypeBit = SUBTYPE_MAP[filters.subtype];
      if (subtypeBit !== undefined) conditions.push(`(datas.type & ${subtypeBit}) = ${subtypeBit}`);
    }
  }

  if (filters.attribute && ATTRIBUTE_MAP[filters.attribute] !== undefined) {
    conditions.push(`datas.attribute = ${ATTRIBUTE_MAP[filters.attribute]}`);
  }

  if (filters.race && RACE_MAP[filters.race] !== undefined) {
    conditions.push(`datas.race = ${RACE_MAP[filters.race]}`);
  }

  for (const rawValue of [filters.setcode1, filters.setcode2, filters.setcode3, filters.setcode4]) {
    if (!rawValue) continue;
    const parsedSetcode = parseSetcodeFilter(rawValue);
    if (parsedSetcode === null) continue;
    conditions.push(
      `(
        ((CAST(datas.setcode AS INTEGER) >> 0) & 65535) = ${parsedSetcode}
        OR ((CAST(datas.setcode AS INTEGER) >> 16) & 65535) = ${parsedSetcode}
        OR ((CAST(datas.setcode AS INTEGER) >> 32) & 65535) = ${parsedSetcode}
        OR ((CAST(datas.setcode AS INTEGER) >> 48) & 65535) = ${parsedSetcode}
      )`
    );
  }

  if (filters.rule) {
    const parsedRule = parseRuleExpression(filters.rule);
    if (parsedRule) {
      conditions.push(parsedRule);
    }
  }

  return {
    whereClause: conditions.length > 0 ? conditions.join(' AND ') : '1=1',
    params,
  };
}
