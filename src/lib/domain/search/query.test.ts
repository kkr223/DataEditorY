import { describe, expect, test } from 'bun:test';
import { buildSearchQuery, parseSetcodeFilter } from './query';
import { DEFAULT_SEARCH_FILTERS } from '$lib/types';
import type { SearchFilters } from '$lib/types';

function filters(overrides: Partial<SearchFilters> = {}): SearchFilters {
  return { ...DEFAULT_SEARCH_FILTERS, ...overrides };
}

describe('search query builder', () => {
  test('builds keyword params and rule clauses together', () => {
    const query = buildSearchQuery(filters({
      name: 'blue eyes',
      id: '12',
      type: 'monster',
      attribute: 'light',
      setcode1: '0x12ab',
      rule: 'type contains effect and level >= 8',
    }));

    expect(query.whereClause).toContain("texts.name LIKE :name ESCAPE '/'");
    expect(query.whereClause).toContain("texts.name LIKE :name1 ESCAPE '/'");
    expect(query.whereClause).toContain('datas.id BETWEEN');
    expect(query.whereClause).toContain('datas.alias BETWEEN');
    expect(query.whereClause).toContain('datas.attribute =');
    expect(query.whereClause).toContain('datas.type &');
    expect(query.params.name).toBe('%blue%');
    expect(query.params.name1).toBe('%eyes%');

    // ID prefix ranges for "12": [12,12], [120,129], …
    const numericParams = Object.entries(query.params).filter(([, v]) => typeof v === 'number');
    const idRangeStarts = numericParams.filter(([, v]) => v === 12 || v === 120 || v === 1200);
    expect(idRangeStarts.length > 0).toBe(true);

    // rule expressions
    expect(query.whereClause).toContain('(datas.type &');
    expect(query.whereClause).toContain('((datas.level & 255) >=');
  });

  test('splits plain whitespace-separated keywords for card names', () => {
    const query = buildSearchQuery(filters({
      name: '  blue   eyes  white  ',
    }));

    expect(query.params.name).toBe('%blue%');
    expect(query.params.name1).toBe('%eyes%');
    expect(query.params.name2).toBe('%white%');
    expect(query.whereClause).toContain("texts.name LIKE :name ESCAPE '/'");
    expect(query.whereClause).toContain("texts.name LIKE :name1 ESCAPE '/'");
    expect(query.whereClause).toContain("texts.name LIKE :name2 ESCAPE '/'");
  });

  test('treats %% as an ordered keyword separator for card names', () => {
    const query = buildSearchQuery(filters({
      name: '黑%%法',
    }));

    expect(query.params.name).toBe('%黑%法%');
    expect(query.whereClause).toContain("texts.name LIKE :name ESCAPE '/'");
  });

  test('supports ordered multi-keyword matching for effect text with whitespace and %% separators', () => {
    const whitespaceQuery = buildSearchQuery(filters({
      desc: 'special summon draw',
    }));
    expect(whitespaceQuery.params.desc).toBe('%special%');
    expect(whitespaceQuery.params.desc1).toBe('%summon%');
    expect(whitespaceQuery.params.desc2).toBe('%draw%');
    expect(whitespaceQuery.whereClause).toContain("texts.desc LIKE :desc ESCAPE '/'");
    expect(whitespaceQuery.whereClause).toContain("texts.desc LIKE :desc1 ESCAPE '/'");
    expect(whitespaceQuery.whereClause).toContain("texts.desc LIKE :desc2 ESCAPE '/'");

    const percentSeparatorQuery = buildSearchQuery(filters({
      desc: 'special%%summon%%draw',
    }));
    expect(percentSeparatorQuery.params.desc).toBe('%special%summon%draw%');
  });

  test('treats whitespace-separated keywords as order-insensitive for card names', () => {
    const query = buildSearchQuery(filters({
      name: '法 黑',
    }));

    expect(query.params.name).toBe('%法%');
    expect(query.params.name1).toBe('%黑%');
    expect(query.whereClause).toContain("texts.name LIKE :name ESCAPE '/'");
    expect(query.whereClause).toContain("texts.name LIKE :name1 ESCAPE '/'");
  });

  test('escapes LIKE special characters in keyword searches', () => {
    const query = buildSearchQuery(filters({
      name: '100%_safe',
      desc: '100%_safe',
    }));

    expect(query.params.name).toBe('%100/%/_safe%');
    expect(query.params.desc).toBe('%100/%/_safe%');
    expect(query.whereClause).toContain("texts.name LIKE :name ESCAPE '/'");
    expect(query.whereClause).toContain("texts.desc LIKE :desc ESCAPE '/'");
  });

  test('handles prefix-only numeric id filters and setcode filters', () => {
    const prefixQuery = buildSearchQuery(filters({
      id: '473',
    }));

    expect(prefixQuery.whereClause).toContain('datas.id BETWEEN');
    // Should contain ranges for 473, 4730-4739, 47300-47399, etc.
    const vals = Object.values(prefixQuery.params).filter((v) => typeof v === 'number');
    expect(vals).toContain(473);
    expect(vals).toContain(4730);
    expect(vals).toContain(4739);

    const invalidPrefixQuery = buildSearchQuery(filters({
      id: '47a3',
    }));
    expect(invalidPrefixQuery.whereClause).toContain('1=0');

    expect(parseSetcodeFilter('0x1af')).toBe(0x1af);
    expect(parseSetcodeFilter('xyz')).toBeNull();
  });

  test('rejects impossible monster-only filters on spell/trap queries', () => {
    const query = buildSearchQuery(filters({
      type: 'spell',
      atkMin: '1000',
    }));

    expect(query.whereClause).toContain('1=0');
  });

  test('treats -1 atk/def filters as DEX-style exact zero searches', () => {
    const atkQuery = buildSearchQuery(filters({
      atkMin: '-1',
    }));
    expect(atkQuery.whereClause).toContain('datas.atk =');
    // -1 means exact 0
    const atkVals = Object.values(atkQuery.params).filter((v) => v === 0);
    expect(atkVals.length > 0).toBe(true);

    const defQuery = buildSearchQuery(filters({
      defMax: '-1',
    }));
    expect(defQuery.whereClause).toContain('datas.def =');
  });

  test('treats DEX unknown-stat markers as exact question-mark searches', () => {
    const atkQuery = buildSearchQuery(filters({
      atkMin: '?',
    }));
    expect(atkQuery.whereClause).toContain('datas.atk =');
    // ? means -2 (unknown marker)
    const atkVals = Object.values(atkQuery.params).filter((v) => v === -2);
    expect(atkVals.length > 0).toBe(true);

    const defQuery = buildSearchQuery(filters({
      defMax: '？',
    }));
    expect(defQuery.whereClause).toContain('datas.def =');

    const dottedQuery = buildSearchQuery(filters({
      atkMax: '.',
    }));
    expect(dottedQuery.whereClause).toContain('datas.atk =');
    // . means -1 → exact 0
    const dotVals = Object.values(dottedQuery.params).filter((v) => v === 0);
    expect(dotVals.length > 0).toBe(true);
  });

  test('supports license rules for draft-driven searches', () => {
    const query = buildSearchQuery(filters({
      rule: 'license = 3 and level = 8',
    }));

    expect(query.whereClause).toContain('datas.ot =');
    expect(query.whereClause).toContain('(datas.level & 255) =');
    const vals = Object.values(query.params);
    expect(vals).toContain(3);
    expect(vals).toContain(8);
  });

  test('infers the main type from spell and trap subtypes', () => {
    const quickplayQuery = buildSearchQuery(filters({
      subtype: 'quickplay',
    }));
    // Should infer spell type and quickplay subtype
    const qpVals = Object.values(quickplayQuery.params);
    expect(qpVals).toContain(0x2);     // spell type bit
    expect(qpVals).toContain(0x10000); // quickplay subtype bit

    const counterQuery = buildSearchQuery(filters({
      subtype: 'counter',
    }));
    const cVals = Object.values(counterQuery.params);
    expect(cVals).toContain(0x4);      // trap type bit
    expect(cVals).toContain(0x100000); // counter subtype bit
  });

  test('returns 1=1 for empty filters', () => {
    const query = buildSearchQuery(filters());
    expect(query.whereClause).toBe('1=1');
    expect(Object.keys(query.params).length).toBe(0);
  });

  test('handles atk/def range filters', () => {
    const query = buildSearchQuery(filters({
      atkMin: '1000',
      atkMax: '2500',
      defMin: '500',
    }));
    expect(query.whereClause).toContain('datas.atk >=');
    expect(query.whereClause).toContain('datas.atk <=');
    expect(query.whereClause).toContain('datas.def >=');
    const vals = Object.values(query.params);
    expect(vals).toContain(1000);
    expect(vals).toContain(2500);
    expect(vals).toContain(500);
  });

  test('appends source id filters and chunks large source-id sets', () => {
    const query = buildSearchQuery(filters({
      name: 'blue',
    }), {
      sourceIds: Array.from({ length: 405 }, (_, index) => index + 1),
    });

    expect(query.whereClause).toContain('texts.name LIKE :name ESCAPE \'/\'');
    expect(query.whereClause).toContain('datas.id IN (');
    expect(query.whereClause.match(/datas\.id IN \(/g)?.length).toBe(2);
    expect(Object.values(query.params)).toContain(405);
  });
});
