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

    expect(query.whereClause).toContain('texts.name LIKE :name0');
    expect(query.whereClause).toContain('texts.name LIKE :name1');
    expect(query.whereClause).toContain('datas.id BETWEEN :idPrefixStart0 AND :idPrefixEnd0');
    expect(query.whereClause).toContain('datas.alias BETWEEN :idPrefixStart0 AND :idPrefixEnd0');
    expect(query.whereClause).toContain('datas.attribute = 16');
    expect(query.whereClause).toContain('= 4779');
    expect(query.whereClause).toContain('datas.type & 32');
    expect(query.params.name0).toBe('%blue%');
    expect(query.params.name1).toBe('%eyes%');
    expect(query.params.idPrefixStart0).toBe(12);
    expect(query.params.idPrefixEnd0).toBe(12);
    expect(query.params.idPrefixStart1).toBe(120);
    expect(query.params.idPrefixEnd1).toBe(129);
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
  });
});
