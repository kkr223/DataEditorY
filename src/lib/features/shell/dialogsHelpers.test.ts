import { describe, expect, test } from 'bun:test';
import { isNewOutputPath } from '$lib/features/shell/dialogsHelpers';

describe('shell dialog helpers', () => {
  test('detects whether an output path is still available', () => {
    expect(isNewOutputPath('c.cdb', ['a.cdb', 'b.cdb'])).toBe(true);
    expect(isNewOutputPath('a.cdb', ['a.cdb', 'b.cdb'])).toBe(false);
  });

  test('treats Windows case and separator variants as the same path', () => {
    expect(isNewOutputPath('C:\\Data\\A.cdb', ['c:/data/a.cdb'])).toBe(false);
    expect(isNewOutputPath('C:\\Data\\B.cdb', ['c:/data/a.cdb'])).toBe(true);
  });
});
