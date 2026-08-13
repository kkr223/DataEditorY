import { describe, expect, test } from 'bun:test';
import { createScriptDocumentSync } from '$lib/features/script-editor/documentSync';

const wait = (duration: number) => new Promise((resolve) => setTimeout(resolve, duration));

describe('script document sync', () => {
  test('coalesces rapid edits into the latest runtime write', async () => {
    const writes: Array<[string, string]> = [];
    const sync = createScriptDocumentSync(
      async (tabId, content) => {
        writes.push([tabId, content]);
      },
      { delayMs: 5 },
    );

    sync.schedule('tab-1', 'a');
    sync.schedule('tab-1', 'ab');
    sync.schedule('tab-1', 'abc');
    await wait(20);

    expect(writes).toEqual([['tab-1', 'abc']]);
    expect(sync.hasPending()).toBe(false);
  });

  test('flushes immediately and cancels the scheduled write', async () => {
    const writes: string[] = [];
    const sync = createScriptDocumentSync(
      async (_tabId, content) => {
        writes.push(content);
      },
      { delayMs: 1_000 },
    );

    sync.schedule('tab-1', 'latest');
    await sync.flush('tab-1');

    expect(writes).toEqual(['latest']);
    expect(sync.hasPending()).toBe(false);
  });

  test('drains an edit queued while a write is in flight', async () => {
    const writes: string[] = [];
    let releaseFirstWrite = () => {};
    let markFirstWriteStarted = () => {};
    const firstWriteStarted = new Promise<void>((resolve) => {
      markFirstWriteStarted = resolve;
    });
    const firstWriteGate = new Promise<void>((resolve) => {
      releaseFirstWrite = resolve;
    });
    const sync = createScriptDocumentSync(
      async (_tabId, content) => {
        writes.push(content);
        if (content === 'first') {
          markFirstWriteStarted();
          await firstWriteGate;
        }
      },
      { delayMs: 1_000 },
    );

    sync.schedule('tab-1', 'first');
    const flush = sync.flush('tab-1');
    await firstWriteStarted;
    sync.schedule('tab-1', 'second');
    releaseFirstWrite();
    await flush;

    expect(writes).toEqual(['first', 'second']);
    expect(sync.hasPending()).toBe(false);
  });
});
