import { describe, expect, test } from 'bun:test';
import { parseStringsCatalog } from './setcodeCatalog';

describe('setcode catalog parsing', () => {
  test('collects valid setname entries from aggregated text files', () => {
    const result = parseStringsCatalog([
      '# comment',
      '!setname 0x1abc Alpha',
      '!setname 2BCD Beta Name',
      '!system 1 ignored',
    ].join('\n'));

    expect(result).toEqual([
      { value: '0x1ABC', label: 'Alpha' },
      { value: '0x2BCD', label: 'Beta Name' },
    ]);
  });

  test('filters malformed and duplicated setname entries', () => {
    const result = parseStringsCatalog([
      '!setname nope Broken',
      '!setname 0x1000',
      '!setname 0x1000 Same',
      '!setname 1000 Same',
      '!setname 0x1000 Different',
    ].join('\n'));

    expect(result).toEqual([
      { value: '0x1000', label: 'Same' },
      { value: '0x1000', label: 'Different' },
    ]);
  });
});
