import { describe, expect, test } from 'bun:test';
import { blobToUint8Array, dataUrlToBlob } from './blob';

describe('card render blob helpers', () => {
  test('converts data urls to typed blobs', async () => {
    const blob = dataUrlToBlob('data:text/plain;base64,SGVsbG8=');
    const bytes = await blobToUint8Array(blob);

    expect(blob.type.startsWith('text/plain')).toBe(true);
    expect(new TextDecoder().decode(bytes)).toBe('Hello');
  });
});
