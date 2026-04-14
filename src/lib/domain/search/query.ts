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

// ---------------------------------------------------------------------------
// DEX-style SQL query builder
//
// Mirrors DataEditorX GetSelectSQL logic: iterate each filter field, append an
// AND clause when the field is non-empty.  The rule expression parser provides
// the "advanced search" capability that DEX does not have.
// ---------------------------------------------------------------------------

/** DEX name-pattern: `%%` is a user-supplied wildcard, otherwise auto-wrap. */
function buildNamePattern(input: string): string {
  const s = input.trim();
  if (!s) return '%';

  // User-supplied wildcards: %% → %
  if (s.includes('%%')) return s.replaceAll('%%', '%');

  // DEX-style keyword search: split plain whitespace into independent terms.
  // This keeps legacy "blue eyes" -> "%blue%eyes%" behavior even when the
  // backend query engine no longer performs token splitting for us.
  const escapedTerms = s
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean)
    .map((term) => term.replaceAll('/', '//').replaceAll('%', '/%').replaceAll('_', '/_'));

  return `%${escapedTerms.join('%')}%`;
}

/** Parse a stat value with DEX special markers: `?/？` → -2, `.` → -1. */
function parseStat(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  if (s === '.' ) return -1;
  if (s === '?' || s === '？') return -2;
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? null : n;
}

/** Parse a hex setcode string like "0x1af" or "12ab". */
export function parseSetcodeFilter(input: string): number | null {
  const s = input.trim();
  if (!s) return null;
  const hex = s.toLowerCase().startsWith('0x') ? s.slice(2) : s;
  if (!/^[\da-f]{1,4}$/i.test(hex)) return null;
  return parseInt(hex, 16) & 0xffff;
}

// ID prefix search — expands "12" into ranges [12,12], [120,129], [1200,1299] …
const MAX_ID_DIGITS = 10;
const MAX_ID_VALUE = 4_294_967_295;

function buildIdPrefixRanges(input: string) {
  const s = input.trim();
  if (!/^\d+$/.test(s)) return [];
  if (s.length > 1 && s.startsWith('0')) return [];
  if (s.length > MAX_ID_DIGITS) return [];

  const prefix = Number(s);
  if (!Number.isSafeInteger(prefix) || prefix > MAX_ID_VALUE) return [];

  const ranges: { start: number; end: number }[] = [];
  for (let digits = s.length; digits <= MAX_ID_DIGITS; digits++) {
    const mul = 10 ** (digits - s.length);
    const start = prefix * mul;
    if (start > MAX_ID_VALUE) break;
    ranges.push({ start, end: Math.min((prefix + 1) * mul - 1, MAX_ID_VALUE) });
  }
  return ranges;
}

// Infer main type when user only selected a subtype
function inferMainType(subtype: string): string {
  if (!subtype) return '';
  if (['quickplay', 'continuous_spell', 'equip', 'field', 'ritual_spell'].includes(subtype)) return 'spell';
  if (['continuous_trap', 'counter'].includes(subtype)) return 'trap';
  if (SUBTYPE_MAP[subtype] !== undefined) return 'monster';
  return '';
}

// ---------------------------------------------------------------------------
// Main entry point — mirrors DEX GetSelectSQL
// ---------------------------------------------------------------------------

export function buildSearchQuery(filters: SearchFilters): CardSearchQuery {
  const conds: string[] = [];
  const params: Record<string, string | number> = {};
  let paramIdx = 0;

  // Helper: bind a numeric value and push a condition
  function bind(value: number): string {
    const key = `p${paramIdx++}`;
    params[key] = value;
    return `:${key}`;
  }

  const mainType = filters.type || inferMainType(filters.subtype);

  // --- name ---
  if (filters.name.trim()) {
    params.name = buildNamePattern(filters.name);
    conds.push(`texts.name LIKE :name ESCAPE '/'`);
  }

  // --- id (prefix search) ---
  if (filters.id.trim()) {
    const ranges = buildIdPrefixRanges(filters.id);
    if (ranges.length > 0) {
      const parts = ranges.map((r) => {
        const lo = bind(r.start);
        const hi = bind(r.end);
        return `(datas.id BETWEEN ${lo} AND ${hi} OR datas.alias BETWEEN ${lo} AND ${hi})`;
      });
      conds.push(`(${parts.join(' OR ')})`);
    } else {
      conds.push('1=0');
    }
  }

  // --- desc ---
  if (filters.desc.trim()) {
    params.desc = `%${filters.desc.trim()}%`;
    conds.push('texts.desc LIKE :desc');
  }

  // --- atk / def (DEX style) ---
  for (const field of ['atk', 'def'] as const) {
    const minRaw = field === 'atk' ? filters.atkMin : filters.defMin;
    const maxRaw = field === 'atk' ? filters.atkMax : filters.defMax;
    const minVal = parseStat(minRaw);
    const maxVal = parseStat(maxRaw);

    // ? → exact unknown, . → exact zero (DEX semantics)
    if (minVal === -2 || maxVal === -2) {
      conds.push(`datas.${field} = ${bind(-2)}`);
    } else if (minVal === -1 || maxVal === -1) {
      conds.push(`datas.${field} = ${bind(0)}`);
    } else {
      if (minVal !== null) conds.push(`datas.${field} >= ${bind(minVal)}`);
      if (maxVal !== null) conds.push(`datas.${field} <= ${bind(maxVal)}`);
    }
  }

  // --- impossible monster-only filters on spell/trap ---
  const hasMonsterFilter =
    filters.atkMin.trim() !== '' ||
    filters.atkMax.trim() !== '' ||
    filters.defMin.trim() !== '' ||
    filters.defMax.trim() !== '' ||
    filters.attribute.trim() !== '' ||
    filters.race.trim() !== '';
  if (hasMonsterFilter && mainType && mainType !== 'monster') {
    conds.push('1=0');
  }

  // --- type (bitmask contains) ---
  if (mainType && TYPE_MAP[mainType] !== undefined) {
    const p = bind(TYPE_MAP[mainType]);
    conds.push(`(datas.type & ${p}) = ${p}`);
  }

  // --- subtype ---
  if (filters.subtype) {
    if (filters.subtype === 'normal' && mainType === 'spell') {
      const p = bind(SPELL_SUBTYPE_MASK);
      conds.push(`(datas.type & ${p}) = 0`);
    } else if (filters.subtype === 'normal' && mainType === 'trap') {
      const p = bind(TRAP_SUBTYPE_MASK);
      conds.push(`(datas.type & ${p}) = 0`);
    } else {
      let bit: number | undefined;
      if (filters.subtype === 'continuous_spell' || filters.subtype === 'continuous_trap') bit = 0x20000;
      else if (filters.subtype === 'ritual_spell') bit = 0x80;
      else bit = SUBTYPE_MAP[filters.subtype];
      if (bit !== undefined) {
        const p = bind(bit);
        conds.push(`(datas.type & ${p}) = ${p}`);
      }
    }
  }

  // --- attribute ---
  if (filters.attribute && ATTRIBUTE_MAP[filters.attribute] !== undefined) {
    conds.push(`datas.attribute = ${bind(ATTRIBUTE_MAP[filters.attribute])}`);
  }

  // --- race ---
  if (filters.race && RACE_MAP[filters.race] !== undefined) {
    conds.push(`datas.race = ${bind(RACE_MAP[filters.race])}`);
  }

  // --- setcodes (1‥4) ---
  for (const raw of [filters.setcode1, filters.setcode2, filters.setcode3, filters.setcode4]) {
    if (!raw) continue;
    const sc = parseSetcodeFilter(raw);
    if (sc === null) continue;
    const p = bind(sc);
    conds.push(`(
      ((CAST(datas.setcode AS INTEGER) >> 0) & 65535) = ${p}
      OR ((CAST(datas.setcode AS INTEGER) >> 16) & 65535) = ${p}
      OR ((CAST(datas.setcode AS INTEGER) >> 32) & 65535) = ${p}
      OR ((CAST(datas.setcode AS INTEGER) >> 48) & 65535) = ${p}
    )`);
  }

  // --- rule expression (advanced search) ---
  if (filters.rule.trim()) {
    const parsed = parseRuleExpression(filters.rule);
    if (parsed) {
      conds.push(parsed.clause);
      Object.assign(params, parsed.params);
    }
  }

  return {
    whereClause: conds.length > 0 ? conds.join(' AND ') : '1=1',
    params,
  };
}
