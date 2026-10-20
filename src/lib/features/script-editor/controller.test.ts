import { describe, expect, test } from 'bun:test';
import {
  resolveScriptReferenceShortcut,
  shouldCloseScriptReferenceOverlay,
} from '$lib/features/script-editor/controller';

function createKeyboardEventLike(
  input: Partial<Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>>,
) {
  return {
    key: '',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...input,
  } as KeyboardEvent;
}

describe('script editor controller helpers', () => {
  test('resolves handbook shortcuts only when the editor or overlay can handle them', () => {
    expect(resolveScriptReferenceShortcut(
      createKeyboardEventLike({ key: 'F9' }),
      true,
      false,
    )).toBe('constants');

    expect(resolveScriptReferenceShortcut(
      createKeyboardEventLike({ key: 'F10' }),
      false,
      true,
    )).toBe('functions');

    expect(resolveScriptReferenceShortcut(
      createKeyboardEventLike({ key: 'F9', ctrlKey: true }),
      true,
      false,
    )).toBeNull();

    expect(resolveScriptReferenceShortcut(
      createKeyboardEventLike({ key: 'F10' }),
      false,
      false,
    )).toBeNull();
  });

  test('closes the handbook overlay with escape only when it is open', () => {
    expect(shouldCloseScriptReferenceOverlay(
      createKeyboardEventLike({ key: 'Escape' }),
      true,
    )).toBe(true);

    expect(shouldCloseScriptReferenceOverlay(
      createKeyboardEventLike({ key: 'Escape' }),
      false,
    )).toBe(false);
  });
});
