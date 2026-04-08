import { describe, expect, test } from 'bun:test';
import { RuleExpressionError, parseRuleExpression } from './ruleExpression';

describe('rule expression parser', () => {
  test('supports ampersand as a short alias for contains', () => {
    const sql = parseRuleExpression('type & link');

    expect(sql?.clause).toContain('(datas.type & :rule0) = :rule0');
    expect(sql?.params.rule0).toBe(67108864);
  });

  test('supports id and alias numeric fields', () => {
    const sql = parseRuleExpression('id >= 473 and alias = 0');

    expect(sql?.clause).toContain('(datas.id >= :rule0)');
    expect(sql?.clause).toContain('(datas.alias = :rule1)');
    expect(sql?.clause).toContain('AND');
    expect(sql?.params.rule0).toBe(473);
    expect(sql?.params.rule1).toBe(0);
  });

  test('parses mask and numeric expressions with aliases', () => {
    const sql = parseRuleExpression('type contains link and atk >= 2500');

    expect(sql?.clause).toContain('(datas.type & :rule0) = :rule0');
    expect(sql?.clause).toContain('(datas.atk >= :rule1)');
    expect(sql?.clause).toContain('AND');
    expect(sql?.params.rule0).toBe(67108864);
    expect(sql?.params.rule1).toBe(2500);
  });

  test('supports chinese keywords and link markers', () => {
    const sql = parseRuleExpression('连接标记 包含 上');

    expect(sql?.clause).toContain('datas.def');
    expect(sql?.clause).toContain('& :rule0');
    expect(sql?.params.rule0).toBe(128);
  });

  test('supports chinese aliases for id and alias fields', () => {
    const sql = parseRuleExpression('密码 = 473 或 同名卡 = 0');

    expect(sql?.clause).toContain('(datas.id = :rule0)');
    expect(sql?.clause).toContain('(datas.alias = :rule1)');
    expect(sql?.clause).toContain('OR');
    expect(sql?.params.rule0).toBe(473);
    expect(sql?.params.rule1).toBe(0);
  });

  test('supports custom parameter prefixes to avoid collisions', () => {
    const sql = parseRuleExpression('atk >= 1500 and def <= 1200', { paramPrefix: 'filterRule' });

    expect(sql?.clause).toContain('(datas.atk >= :filterRule0)');
    expect(sql?.clause).toContain('(datas.def <= :filterRule1)');
    expect(sql?.params.filterRule0).toBe(1500);
    expect(sql?.params.filterRule1).toBe(1200);
  });

  test('throws structured errors for unsupported keywords', () => {
    expect(() => parseRuleExpression('attribute contains rainbow')).toThrow(RuleExpressionError);

    try {
      parseRuleExpression('attribute contains rainbow');
    } catch (error) {
      expect(error).toBeInstanceOf(RuleExpressionError);
      expect((error as RuleExpressionError).code).toBe('unsupported_value');
    }
  });
});
