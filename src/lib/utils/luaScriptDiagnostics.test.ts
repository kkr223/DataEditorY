import { describe, expect, test } from 'bun:test';
import { analyzeLuaScript } from './luaScriptDiagnostics';

describe('lua script diagnostics', () => {
  test('accepts a minimal valid script shape', () => {
    const diagnostics = analyzeLuaScript([
      'local s,id=GetID()',
      'function s.initial_effect(c)',
      'end',
      '',
    ].join('\n'));

    expect(diagnostics).toEqual([]);
  });

  test('reports syntax and structure problems', () => {
    const diagnostics = analyzeLuaScript([
      'local s,id=GetID()',
      'function s.initial_effect(c)',
      '\tlocal e1=Effect.CreateEffect(c)',
      '',
    ].join('\n'));

    expect(diagnostics.some((item) => item.severity === 'error')).toBe(true);
    expect(diagnostics.some((item) => item.message.includes('未闭合'))).toBe(true);
  });

  test('reports unknown api members and arity mismatches', () => {
    const diagnostics = analyzeLuaScript([
      'local s,id=GetID()',
      'function s.initial_effect(c)',
      '\tDuel.NotARealApi()',
      '\tCard.IsType(c)',
      'end',
      '',
    ].join('\n'));

    expect(diagnostics.some((item) => item.message.includes('not a known API member'))).toBe(true);
    expect(diagnostics.some((item) => item.message.includes('expects'))).toBe(true);
  });
});
