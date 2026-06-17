import type { SearchFilters } from '$lib/types';
import {
  ATTRIBUTE_MAP,
  RACE_MAP,
  SPELL_SUBTYPE_MASK,
  SUBTYPE_MAP,
  TRAP_SUBTYPE_MASK,
  TYPE_MAP,
} from '$lib/domain/card/taxonomy';
import { parseSetcodeFilter } from '$lib/domain/search/query';
import { parseRuleExpressionAst } from '$lib/domain/search/ruleExpression';
import type { CardSearchExpression } from './types';

const and = (expressions: CardSearchExpression[]): CardSearchExpression => {
  const active = expressions.filter((expression) => expression.kind !== 'all');
  if (active.length === 0) return { kind: 'all' };
  if (active.length === 1) return active[0];
  return { kind: 'and', expressions: active };
};

const or = (expressions: CardSearchExpression[]): CardSearchExpression => {
  if (expressions.length === 0) return { kind: 'all' };
  if (expressions.length === 1) return expressions[0];
  return { kind: 'or', expressions };
};

const textExpression = (
  field: 'name' | 'desc',
  input: string,
): CardSearchExpression | null => {
  const values = input
    .trim()
    .split(input.includes('%%') ? /%%/ : /\s+/)
    .map((value) => value.trim())
    .filter(Boolean);
  if (values.length === 0) return null;
  if (input.includes('%%')) {
    return { kind: 'orderedTextContains', field, values };
  }
  return and(values.map((value) => ({ kind: 'textContains', field, value })));
};

const parseStat = (input: string) => {
  const value = input.trim();
  if (!value) return null;
  if (value === '.') return 0;
  if (value === '?' || value === '？') return -2;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
};

const inferMainType = (subtype: string) => {
  if (!subtype) return '';
  if (['quickplay', 'continuous_spell', 'equip', 'field', 'ritual_spell'].includes(subtype)) {
    return 'spell';
  }
  if (['continuous_trap', 'counter'].includes(subtype)) {
    return 'trap';
  }
  return SUBTYPE_MAP[subtype] !== undefined ? 'monster' : '';
};

const compareRange = (
  field: 'atk' | 'def',
  minInput: string,
  maxInput: string,
): CardSearchExpression[] => {
  const min = parseStat(minInput);
  const max = parseStat(maxInput);
  if (min === -2 || max === -2) {
    return [{ kind: 'compare', field, operator: 'eq', value: -2 }];
  }
  if (
    (min === 0 && minInput.trim() === '.')
    || (max === 0 && maxInput.trim() === '.')
  ) {
    return [{ kind: 'compare', field, operator: 'eq', value: 0 }];
  }
  return [
    ...(min === null ? [] : [{ kind: 'compare', field, operator: 'gte', value: min } as const]),
    ...(max === null ? [] : [{ kind: 'compare', field, operator: 'lte', value: max } as const]),
  ];
};

export const buildCardSearchExpression = (
  filters: SearchFilters,
  sourceIds?: number[],
): CardSearchExpression => {
  const expressions: CardSearchExpression[] = [];
  const name = textExpression('name', filters.name);
  const desc = textExpression('desc', filters.desc);
  if (name) expressions.push(name);
  if (desc) expressions.push(desc);

  const combinedTerms = filters.nameOrDesc
    .trim()
    .split(filters.nameOrDesc.includes('%%') ? /%%/ : /\s+/)
    .map((value) => value.trim())
    .filter(Boolean);
  if (combinedTerms.length > 0) {
    const ordered = filters.nameOrDesc.includes('%%');
    expressions.push(ordered
      ? or([
          { kind: 'orderedTextContains', field: 'name', values: combinedTerms },
          { kind: 'orderedTextContains', field: 'desc', values: combinedTerms },
        ])
      : and(combinedTerms.map((value) => or([
          { kind: 'textContains', field: 'name', value },
          { kind: 'textContains', field: 'desc', value },
        ]))));
  }

  if (filters.id.trim()) {
    expressions.push({ kind: 'idPrefix', value: filters.id.trim() });
  }
  const ruleExpression = parseRuleExpressionAst(filters.rule);
  if (ruleExpression) {
    expressions.push(ruleExpression);
  }

  expressions.push(...compareRange('atk', filters.atkMin, filters.atkMax));
  expressions.push(...compareRange('def', filters.defMin, filters.defMax));

  const mainType = filters.type || inferMainType(filters.subtype);
  const hasMonsterOnlyFilter = [
    filters.atkMin,
    filters.atkMax,
    filters.defMin,
    filters.defMax,
    filters.attribute,
    filters.race,
  ].some((value) => value.trim() !== '');
  if (hasMonsterOnlyFilter && mainType && mainType !== 'monster') {
    return { kind: 'inIds', values: [] };
  }

  if (mainType && TYPE_MAP[mainType] !== undefined) {
    expressions.push({ kind: 'maskContains', field: 'type', value: TYPE_MAP[mainType] });
  }
  if (filters.subtype) {
    if (filters.subtype === 'normal' && mainType === 'spell') {
      expressions.push({
        kind: 'maskExcludes',
        field: 'type',
        value: SPELL_SUBTYPE_MASK,
      });
    } else if (filters.subtype === 'normal' && mainType === 'trap') {
      expressions.push({
        kind: 'maskExcludes',
        field: 'type',
        value: TRAP_SUBTYPE_MASK,
      });
    } else {
      const bit = filters.subtype === 'continuous_spell' || filters.subtype === 'continuous_trap'
        ? 0x20000
        : filters.subtype === 'ritual_spell'
          ? 0x80
          : SUBTYPE_MAP[filters.subtype];
      if (bit !== undefined) {
        expressions.push({ kind: 'maskContains', field: 'type', value: bit });
      }
    }
  }

  if (filters.attribute && ATTRIBUTE_MAP[filters.attribute] !== undefined) {
    expressions.push({
      kind: 'compare',
      field: 'attribute',
      operator: 'eq',
      value: ATTRIBUTE_MAP[filters.attribute],
    });
  }
  if (filters.race && RACE_MAP[filters.race] !== undefined) {
    expressions.push({
      kind: 'compare',
      field: 'race',
      operator: 'eq',
      value: RACE_MAP[filters.race],
    });
  }
  for (const input of [
    filters.setcode1,
    filters.setcode2,
    filters.setcode3,
    filters.setcode4,
  ]) {
    const value = parseSetcodeFilter(input);
    if (value !== null) {
      expressions.push({ kind: 'setcodeContains', value });
    }
  }
  if (sourceIds) {
    expressions.push({ kind: 'inIds', values: sourceIds });
  }
  return and(expressions);
};
