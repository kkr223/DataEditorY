import { describe, expect, test } from 'bun:test';
import { parseStringsCatalog, parseStringsCatalogWithDiagnostics } from './setcodeCatalog';

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

  test('filters malformed entries and lets later duplicates override earlier ones', () => {
    const result = parseStringsCatalog([
      '!setname nope Broken',
      '!setname 0x1000',
      '!setname 0x1000 Same',
      '!setname 1000 Same',
      '!setname 0x1000 Different',
      '!setname 0x1001 Unique',
      '!setname 0x1000 Final',
    ].join('\n'));

    expect(result).toEqual([
      { value: '0x1001', label: 'Unique' },
      { value: '0x1000', label: 'Final' },
    ]);
  });

  test('reports duplicated setcodes while keeping only the last definition', () => {
    const result = parseStringsCatalogWithDiagnostics([
      '!setname 0x075E First',
      '!setname 0x1001 Unique',
      '!setname 0x075E Final',
      '!setname 0x1001 Final Unique',
    ].join('\n'));

    expect(result).toEqual({
      options: [
        { value: '0x075E', label: 'Final' },
        { value: '0x1001', label: 'Final Unique' },
      ],
      duplicateSetcodes: ['0x075E', '0x1001'],
    });
  });
});
