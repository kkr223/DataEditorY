import { describe, expect, test } from 'bun:test';
import { collectLuaCallHighlights, collectLuaInlineHighlights } from './calls';

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

  test('collects call arguments, parameter usages, and constants', () => {
    const highlights = collectLuaInlineHighlights([
      'function s.spfilter(c,e,tp)',
      '\treturn c:IsRace(RACE_PSYCHO) and Duel.IsExistingMatchingCard(s.spfilter,tp,LOCATION_DECK+LOCATION_EXTRA,0,1,nil,e,tp,c)',
      'end',
      '',
    ].join('\n'));

    expect(highlights.some((item) => item.className === 'lua-call-arg-highlight' && item.startLineNumber === 2)).toBe(true);
    expect(highlights.some((item) => item.className === 'lua-parameter-highlight' && item.startLineNumber === 2)).toBe(true);
    expect(highlights.some((item) => item.className === 'lua-constant-highlight' && item.startLineNumber === 2)).toBe(true);
  });
});

