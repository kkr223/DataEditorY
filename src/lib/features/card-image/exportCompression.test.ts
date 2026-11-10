import { expect, test } from 'bun:test';
import { compressCardImageForExport, fitCardImageToSize } from './exportCompression';

const image = (size: number, type = 'image/jpeg') => new Blob([new Uint8Array(size)], { type });

test('disabled compression and files within the limit retain their original bytes without decoding', async () => {
  const original = image(2048);
  expect(await compressCardImageForExport(original, 'jpg', 0)).toBe(original);
  expect(await compressCardImageForExport(original, 'jpg', 2)).toBe(original);
  expect(await compressCardImageForExport(original, 'png', 3)).toBe(original);
});

test('JPEG compression meets the limit at the original resolution when quality alone suffices', async () => {
  const sizes: number[][] = [];
  const result = await fitCardImageToSize({
    original: image(9000), width: 100, height: 200, format: 'jpg', maxBytes: 6000,
    encode: async (width, height, quality = 1) => {
      sizes.push([width, height]);
      return image(Math.ceil(width * height * quality / 2));
    },
  });
  expect(result.size < 6000).toBe(true);
  expect(result.size > 5900).toBe(true);
  expect(sizes.every(([width, height]) => width === 100 && height === 200)).toBe(true);
});

test('very small JPEG limits also reduce dimensions and never return oversized bytes', async () => {
  let reduced = false;
  const result = await fitCardImageToSize({
    original: image(9000), width: 100, height: 200, format: 'jpg', maxBytes: 500,
    encode: async (width, height, quality = 1) => {
      if (width < 100 && height < 200) reduced = true;
      expect(width > 0 && height > 0).toBe(true);
      return image(100 + Math.ceil(width * height * quality / 2));
    },
  });
  expect(reduced).toBe(true);
  expect(result.size < 500).toBe(true);
});

test('PNG reduces dimensions and preserves the output format with a strict byte limit', async () => {
  const result = await fitCardImageToSize({
    original: image(20000, 'image/png'), width: 100, height: 200, format: 'png', maxBytes: 2000,
    encode: async (width, height, quality) => {
      expect(quality).toBe(undefined);
      return image(width * height, 'image/png');
    },
  });
  expect(result.size < 2000).toBe(true);
  expect(result.type).toBe('image/png');
});

test('an unattainable limit fails rather than permitting an oversized save', async () => {
  let failed = false;
  try {
    await fitCardImageToSize({
      original: image(100), width: 2, height: 2, format: 'png', maxBytes: 10,
      encode: async () => image(100, 'image/png'),
    });
  } catch { failed = true; }
  expect(failed).toBe(true);
});
