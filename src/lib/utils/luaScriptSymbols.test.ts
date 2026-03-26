import { describe, expect, test } from 'bun:test';
import { collectLuaScriptFunctionSymbols } from './luaScriptSymbols';

describe('lua script symbols', () => {
  test('collects local, namespaced, and legacy card functions', () => {
    const symbols = collectLuaScriptFunctionSymbols([
      'local function helper(e,tp)',
      'end',
      '',
      'function s.target(e,tp,eg,ep,ev,re,r,rp,chk)',
      'end',
      '',
      'function c12345678.initial_effect(c)',
      'end',
      '',
    ].join('\n'));

    expect(symbols.map((item) => item.name)).toEqual([
      'helper',
      's.target',
      'c12345678.initial_effect',
    ]);
    expect(symbols[1]?.shortName).toBe('target');
    expect(symbols[2]?.namespace).toBe('c12345678');
  });
});
