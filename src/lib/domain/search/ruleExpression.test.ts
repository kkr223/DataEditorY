import { describe, expect, test } from 'bun:test';
import { RuleExpressionError, parseRuleExpression } from './ruleExpression';

describe('rule expression parser', () => {
  test('supports ampersand as a short alias for contains', () => {
    const sql = parseRuleExpression('type & link');

    expect(sql).toContain('(datas.type & 67108864) = 67108864');
  });

  test('supports id and alias numeric fields', () => {
    const sql = parseRuleExpression('id >= 473 and alias = 0');

    expect(sql).toContain('(datas.id >= 473)');
    expect(sql).toContain('(datas.alias = 0)');
    expect(sql).toContain('AND');
  });

  test('parses mask and numeric expressions with aliases', () => {
    const sql = parseRuleExpression('type contains link and atk >= 2500');

    expect(sql).toContain('(datas.type & 67108864) = 67108864');
    expect(sql).toContain('(datas.atk >= 2500)');
    expect(sql).toContain('AND');
  });

  test('supports chinese keywords and link markers', () => {
    const sql = parseRuleExpression('连接标记 包含 上');

    expect(sql).toContain('datas.def');
    expect(sql).toContain('& 128');
  });

  test('supports chinese aliases for id and alias fields', () => {
    const sql = parseRuleExpression('密码 = 473 或 同名卡 = 0');

    expect(sql).toContain('(datas.id = 473)');
    expect(sql).toContain('(datas.alias = 0)');
    expect(sql).toContain('OR');
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
