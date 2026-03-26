import { describe, expect, test } from 'bun:test';
import { collectLuaCallHighlights } from './luaScriptCalls';

describe('lua script call highlights', () => {
  test('collects plain and member call identifiers', () => {
    const highlights = collectLuaCallHighlights([
      'local s,id=GetID()',
      'function s.initial_effect(c)',
      '\thelper(c)',
      '\tDuel.Destroy(c,REASON_EFFECT)',
      'end',
      '',
    ].join('\n'));

    expect(highlights).toHaveLength(3);
    expect(highlights[0]?.startLineNumber).toBe(1);
    expect(highlights[1]?.startLineNumber).toBe(3);
    expect(highlights[2]?.startLineNumber).toBe(4);
  });
});
