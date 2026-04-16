import { describe, expect, test } from 'bun:test';
import { collectLuaScopedIdentifiers } from './scope';

describe('lua script scope', () => {
  test('collects function parameters and previous locals at the cursor position', () => {
    const identifiers = collectLuaScopedIdentifiers(
      [
        'local s,id=GetID()',
        'function s.target(e,tp,eg,ep,ev,re,r,rp,chk)',
        '  local c=e:GetHandler()',
        '  tp',
        'end',
        '',
      ].join('\n'),
      { lineNumber: 4, column: 5 },
    );

    expect(identifiers.map((item) => item.name)).toEqual([
      's',
      'id',
      'e',
      'tp',
      'eg',
      'ep',
      'ev',
      're',
      'r',
      'rp',
      'chk',
      'c',
    ]);
  });

  test('does not expose locals declared after the cursor position', () => {
    const identifiers = collectLuaScopedIdentifiers(
      [
        'local function helper(tp)',
        '  local before=1',
        '  tp',
        '  local after=2',
        'end',
        '',
      ].join('\n'),
      { lineNumber: 3, column: 5 },
    );

    expect(identifiers.map((item) => item.name)).toEqual(['helper', 'tp', 'before']);
    expect(identifiers.some((item) => item.name === 'after')).toBe(false);
  });
});

