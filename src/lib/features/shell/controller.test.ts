import { describe, expect, test } from 'bun:test';
import { isCdbFilePath, isNativeTextUndoDescriptor, normalizeExternalOpenPaths } from './controller';

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

  test('treats text inputs as native undo targets', () => {
    expect(
      isNativeTextUndoDescriptor({
        tagName: 'input',
        inputType: 'text',
        isContentEditable: false,
        insideMonaco: false,
        insideContentEditable: false,
      }),
    ).toBe(true);
  });

  test('does not treat non-text controls as native undo targets', () => {
    expect(
      isNativeTextUndoDescriptor({
        tagName: 'select',
        isContentEditable: false,
        insideMonaco: false,
        insideContentEditable: false,
      }),
    ).toBe(false);
  });
});
