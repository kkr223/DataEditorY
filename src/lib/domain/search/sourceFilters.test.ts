import { describe, expect, test } from 'bun:test';
import { parseDeckTextToCardIds, splitSourceTerms } from './sourceFilters';

describe('source filter helpers', () => {
  test('parses ydk and freeform deck text into unique ids', () => {
    const ids = parseDeckTextToCardIds([
      '#main',
      '89631139',
      '12345678',
      '!side',
      '89631139',
      'deck: 44519536',
      'not-a-card',
    ].join('\n'));

    expect(ids).toEqual([89631139, 12345678, 44519536]);
  });

  test('splits numeric source terms from exact-name source terms', () => {
    const result = splitSourceTerms([
      '89631139',
      '黑魔导',
      '  青眼白龙  ',
      '89631139',
      '',
    ]);

    expect(result.ids).toEqual([89631139]);
    expect(result.names).toEqual(['黑魔导', '青眼白龙']);
  });
});
