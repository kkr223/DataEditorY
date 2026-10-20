import { expect, test } from 'bun:test';
import { closeDocumentsForWindowExit } from './workspaceShutdown';
import type { DocumentRuntime } from '$lib/platform/runtime';

test('window exit closes native documents through their rollback protocol before returning', async () => {
  const calls: string[] = [];
  const runtime = {
    snapshot: { documents: [{ id: 'A' }, { id: 'script' }, { id: 'B' }] },
    close: async (id: string, force: boolean) => { expect(force).toBe(true); calls.push(id); },
  } as unknown as Pick<DocumentRuntime, 'snapshot' | 'close'>;
  await closeDocumentsForWindowExit(runtime, async () => { calls.push('flush'); });
  expect(calls).toEqual(['flush', 'A', 'script', 'B', 'flush']);
});

test('failed rollback prevents the window exit workflow from succeeding', async () => {
  const runtime = {
    snapshot: { documents: [{ id: 'A' }] },
    close: async () => { throw new Error('asset rollback failed'); },
  } as unknown as Pick<DocumentRuntime, 'snapshot' | 'close'>;
  let failure: unknown;
  try { await closeDocumentsForWindowExit(runtime, async () => {}); }
  catch (error) { failure = error; }
  expect(String(failure)).toContain('asset rollback failed');
});

test('failed metadata persistence prevents closing any workspace', async () => {
  const closed: string[] = [];
  const runtime = {
    snapshot: { documents: [{ id: 'A' }] },
    close: async (id: string) => { closed.push(id); },
  } as unknown as Pick<DocumentRuntime, 'snapshot' | 'close'>;
  await expect(closeDocumentsForWindowExit(runtime, async () => {
    throw new Error('metadata save failed');
  })).rejects.toThrow('metadata save failed');
  expect(closed).toHaveLength(0);
});
