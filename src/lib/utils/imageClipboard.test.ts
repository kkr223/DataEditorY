import { expect, test } from 'bun:test';
import { writeImageBlobToClipboard } from './imageClipboard';

test('writes a PNG blob to the image clipboard', async () => {
  const originalClipboardItem = globalThis.ClipboardItem;
  const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  const writes: unknown[][] = [];
  class MockClipboardItem {
    constructor(readonly data: Record<string, Blob>) {}
  }

  Object.defineProperty(globalThis, 'ClipboardItem', { value: MockClipboardItem, configurable: true });
  Object.defineProperty(navigator, 'clipboard', {
    value: { write: async (items: unknown[]) => { writes.push(items); } },
    configurable: true,
  });

  try {
    const blob = new Blob(['png'], { type: 'image/png' });
    await writeImageBlobToClipboard(blob);
    expect((writes[0][0] as MockClipboardItem).data['image/png']).toBe(blob);
  } finally {
    if (originalClipboardItem) globalThis.ClipboardItem = originalClipboardItem;
    else Reflect.deleteProperty(globalThis, 'ClipboardItem');
    if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
    else Reflect.deleteProperty(navigator, 'clipboard');
  }
});
