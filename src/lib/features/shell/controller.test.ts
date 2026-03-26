import { describe, expect, test } from 'bun:test';
import { isCdbFilePath, normalizeExternalOpenPaths } from './controller';

describe('shell controller helpers', () => {
  test('recognizes cdb file paths', () => {
    expect(isCdbFilePath('cards.cdb')).toBe(true);
    expect(isCdbFilePath('cards.CDB')).toBe(true);
    expect(isCdbFilePath('cards.db')).toBe(false);
  });

  test('deduplicates and filters external open paths', () => {
    expect(
      normalizeExternalOpenPaths([
        ' a.cdb ',
        'b.txt',
        'A.CDB',
        '',
        'a.cdb',
      ]),
    ).toEqual(['a.cdb', 'A.CDB']);
  });
});
