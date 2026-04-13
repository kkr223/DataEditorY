import { describe, expect, test } from 'bun:test';
import { buildSearchQuery, parseSetcodeFilter } from './query';

describe('search query builder', () => {
  test('builds keyword params and rule clauses together', () => {
    const query = buildSearchQuery({
      name: 'blue eyes',
      id: '12',
      type: 'monster',
      attribute: 'light',
      setcode1: '0x12ab',
      rule: 'type contains effect and level >= 8',
    });

    expect(query.whereClause).toContain("texts.name LIKE :name ESCAPE '/'");
    expect(query.whereClause).toContain('datas.id BETWEEN :idPrefixStart0 AND :idPrefixEnd0');
    expect(query.whereClause).toContain('datas.alias BETWEEN :idPrefixStart0 AND :idPrefixEnd0');
    expect(query.whereClause).toContain('datas.attribute = :attribute');
    expect(query.whereClause).toContain('= :setcode0');
    expect(query.whereClause).toContain('datas.type & :typeBit');
    expect(query.params.name).toBe('%blue eyes%');
    expect(query.params.idPrefixStart0).toBe(12);
    expect(query.params.idPrefixEnd0).toBe(12);
    expect(query.params.idPrefixStart1).toBe(120);
    expect(query.params.idPrefixEnd1).toBe(129);
    expect(query.params.attribute).toBe(16);
    expect(query.params.setcode0).toBe(0x12ab);
    expect(query.params.typeBit).toBe(0x1);
    expect(query.whereClause).toContain('(datas.type & :rule0) = :rule0');
    expect(query.whereClause).toContain('((datas.level & 255) >= :rule1)');
    expect(query.params.rule0).toBe(0x20);
    expect(query.params.rule1).toBe(8);
  });

  test('follows DEX wildcard semantics for card names', () => {
    const wildcardQuery = buildSearchQuery({
      name: 'AOJ%%',
    });
    expect(wildcardQuery.params.name).toBe('AOJ%');

    const suffixQuery = buildSearchQuery({
      name: '%%Warrior',
    });
    expect(suffixQuery.params.name).toBe('%Warrior');

    const escapedQuery = buildSearchQuery({
      name: '100%_safe',
    });
    expect(escapedQuery.params.name).toBe('%100/%/_safe%');
    expect(escapedQuery.whereClause).toContain("ESCAPE '/'");
  });

  test('handles prefix-only numeric id filters and setcode filters', () => {
    const prefixQuery = buildSearchQuery({
      id: '473',
    });

    expect(prefixQuery.whereClause).toContain('datas.id BETWEEN :idPrefixStart0 AND :idPrefixEnd0');
    expect(prefixQuery.params.idPrefixStart0).toBe(473);
    expect(prefixQuery.params.idPrefixEnd0).toBe(473);
    expect(prefixQuery.params.idPrefixStart1).toBe(4730);
    expect(prefixQuery.params.idPrefixEnd1).toBe(4739);

    const invalidPrefixQuery = buildSearchQuery({
      id: '47a3',
    });

    expect(invalidPrefixQuery.whereClause).toContain('1=0');
    expect(parseSetcodeFilter('0x1af')).toBe(0x1af);
    expect(parseSetcodeFilter('xyz')).toBeNull();
  });

  test('rejects impossible monster-only filters on spell/trap queries', () => {
    const query = buildSearchQuery({
      type: 'spell',
      atkMin: '1000',
    });

    expect(query.whereClause).toContain('1=0');
    expect(query.params.atkMin).toBe(1000);
  });

  test('treats -1 atk/def filters as DEX-style exact zero searches', () => {
    const atkQuery = buildSearchQuery({
      atkMin: '-1',
    });
    expect(atkQuery.whereClause).toContain('datas.atk = :atkZero');
    expect(atkQuery.params.atkZero).toBe(0);

    const defQuery = buildSearchQuery({
      defMax: '-1',
    });
    expect(defQuery.whereClause).toContain('datas.def = :defZero');
    expect(defQuery.params.defZero).toBe(0);
  });

  test('treats DEX unknown-stat markers as exact question-mark searches', () => {
    const atkQuery = buildSearchQuery({
      atkMin: '?',
    });
    expect(atkQuery.whereClause).toContain('datas.atk = :atkUnknown');
    expect(atkQuery.params.atkUnknown).toBe(-2);

    const defQuery = buildSearchQuery({
      defMax: '？',
    });
    expect(defQuery.whereClause).toContain('datas.def = :defUnknown');
    expect(defQuery.params.defUnknown).toBe(-2);

    const dottedQuery = buildSearchQuery({
      atkMax: '.',
    });
    expect(dottedQuery.whereClause).toContain('datas.atk = :atkZero');
    expect(dottedQuery.params.atkZero).toBe(0);
  });

  test('supports license rules for draft-driven searches', () => {
    const query = buildSearchQuery({
      rule: 'license = 3 and level = 8',
    });

    expect(query.whereClause).toContain('(datas.ot = :rule0)');
    expect(query.whereClause).toContain('((datas.level & 255) = :rule1)');
    expect(query.params.rule0).toBe(3);
    expect(query.params.rule1).toBe(8);
  });

  test('infers the main type from spell and trap subtypes', () => {
    const quickplayQuery = buildSearchQuery({
      subtype: 'quickplay',
    });
    expect(quickplayQuery.params.typeBit).toBe(0x2);
    expect(quickplayQuery.params.subtypeBit).toBe(0x10000);

    const counterQuery = buildSearchQuery({
      subtype: 'counter',
    });
    expect(counterQuery.params.typeBit).toBe(0x4);
    expect(counterQuery.params.subtypeBit).toBe(0x100000);
  });
});
