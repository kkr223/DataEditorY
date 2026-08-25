import { expect, test } from 'bun:test';
import { cardImageBytesToDataUrl } from './cardImageService';

test('encodes freshly imported card image bytes as a cache-independent preview source', () => {
  expect(cardImageBytesToDataUrl([0xff, 0xd8, 0xff, 0xd9]))
    .toBe('data:image/jpeg;base64,/9j/2Q==');
});
