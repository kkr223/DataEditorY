import { describe, expect, test } from 'bun:test';
import { getSetcode, normalizeSetcodeHex, updateSetcode } from './setcode';

describe('setcode helpers', () => {
  test('reads packed bigint segments as padded hex', () => {
    const packed = 0x00ffn | (0x10abn << 16n);

    expect(getSetcode(packed, 0)).toBe('0x00FF');
    expect(getSetcode(packed, 1)).toBe('0x10AB');
    expect(getSetcode(packed, 2)).toBe('');
  });

  test('updates array-backed setcodes immutably', () => {
    const current = [0x12, 0xabcd];
    const next = updateSetcode(current, 1, '0x34ef');

    expect(next).toEqual([0x12, 0x34ef]);
    expect(current).toEqual([0x12, 0xabcd]);
  });

  test('updates packed bigint setcodes', () => {
    const next = updateSetcode(0n, 3, 'BEEF');

    expect(getSetcode(next, 3)).toBe('0xBEEF');
  });

  test('normalizes setcode hex input', () => {
    expect(normalizeSetcodeHex('0x12gh34')).toBe('0123');
    expect(normalizeSetcodeHex('beefcafe')).toBe('BEEF');
  });
});
