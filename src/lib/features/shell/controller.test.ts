import { describe, expect, test } from 'bun:test';
import {
  classifyExternalOpenPaths,
  isCdbFilePath,
  isExternalTextFilePath,
  isNativeTextUndoDescriptor,
  normalizeExternalOpenPaths,
} from './controller';

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

  test('recognizes external text and script file paths', () => {
    expect(isExternalTextFilePath('script/c123.lua')).toBe(true);
    expect(isExternalTextFilePath('notes.TXT')).toBe(true);
    expect(isExternalTextFilePath('strings.conf')).toBe(true);
    expect(isExternalTextFilePath('cards.cdb')).toBe(false);
    expect(isExternalTextFilePath('image.png')).toBe(false);
  });

  test('classifies cdb and external text open paths separately', () => {
    expect(
      classifyExternalOpenPaths([
        ' cards.cdb ',
        'script/c123.lua',
        'notes.txt',
        'strings.CONF',
        'image.png',
        'script/c123.lua',
      ]),
    ).toEqual({
      cdbPaths: ['cards.cdb'],
      textPaths: ['script/c123.lua', 'notes.txt', 'strings.CONF'],
    });
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
