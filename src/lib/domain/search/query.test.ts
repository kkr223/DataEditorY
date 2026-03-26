import { describe, expect, test } from 'bun:test';
import { buildSearchQuery, normalizeRegexSource, parseSetcodeFilter } from './query';

describe('search query builder', () => {
  test('builds keyword params and rule clauses together', () => {
    const query = buildSearchQuery({
      name: 'blue eyes',
      id: '/^12/',
      type: 'monster',
      attribute: 'light',
      setcode1: '0x12ab',
      rule: 'type contains effect and level >= 8',
    });

    expect(query.whereClause).toContain('texts.name LIKE :name0');
    expect(query.whereClause).toContain('texts.name LIKE :name1');
    expect(query.whereClause).toContain('REGEXP(:idRegex');
    expect(query.whereClause).toContain('datas.attribute = 16');
    expect(query.whereClause).toContain('= 4779');
    expect(query.whereClause).toContain('datas.type & 32');
    expect(query.params.name0).toBe('%blue%');
    expect(query.params.name1).toBe('%eyes%');
    expect(query.params.idRegex).toBe('^12');
  });

  test('normalizes regex and setcode filters', () => {
    expect(normalizeRegexSource('/abc/i')).toBe('abc');
    expect(normalizeRegexSource('plain-text')).toBe('plain-text');
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
