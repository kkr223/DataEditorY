import * as bunTest from 'bun:test';
import type { WorkspaceMetadata } from '$lib/native/metadataApi';

const { test, expect } = bunTest;
const mock = (bunTest as unknown as {
  mock: { module: (specifier: string, factory: () => unknown) => void };
}).mock;
const disk = new Map<string, WorkspaceMetadata>();
const writes: string[] = [];
let load = async (path: string): Promise<WorkspaceMetadata> => structuredClone(disk.get(path) ?? { version: 1, cdbPath: path });
let save = async (path: string, metadata: WorkspaceMetadata) => {
  disk.set(path, metadata);
  writes.push(path);
  return metadata;
};
mock.module('$lib/native/metadataApi', () => ({
  loadWorkspaceMetadata: (path: string) => load(path),
  saveWorkspaceMetadata: (path: string, metadata: WorkspaceMetadata) => save(path, metadata),
}));

// These tests exercise persistence ordering; rendering is not needed for the state container.
const stateDescriptor = Object.getOwnPropertyDescriptor(globalThis, '$state');
Object.defineProperty(globalThis, '$state', { configurable: true, value: (value: unknown) => value });
const state = await import('./workspaceMetadataState.svelte');
if (stateDescriptor) Object.defineProperty(globalThis, '$state', stateDescriptor);
else Reflect.deleteProperty(globalThis, '$state');

async function settle() {
  for (let index = 0; index < 30; index += 1) await Promise.resolve();
}

test('an asynchronous AI owner stays invalid after switching away and back', async () => {
  state.loadWorkspaceMetadataForPath('owner-A.cdb');
  await settle();
  const isCurrent = state.captureWorkspaceMetadataScope();
  expect(isCurrent()).toBe(true);
  state.loadWorkspaceMetadataForPath('owner-B.cdb');
  await settle();
  expect(isCurrent()).toBe(false);
  state.loadWorkspaceMetadataForPath('owner-A.cdb');
  await settle();
  expect(isCurrent()).toBe(false);
});

test('background image and task mutations preserve concurrent updates', async () => {
  state.loadWorkspaceMetadataForPath('foreground.cdb');
  await settle();
  const image = { kind: 'dataeditory-card-image-config' as const, version: 1 as const, form: {} };
  await Promise.all([
    state.setCardImageDocumentForPath('background.cdb', 100, image),
    state.setCardImageDocumentForPath('background.cdb', 200, image),
    state.appendWorkspaceTaskHistoryForPath('background.cdb', { kind: 'test', label: 'first' }),
    state.appendWorkspaceTaskHistoryForPath('background.cdb', { kind: 'test', label: 'second' }),
  ]);
  state.loadWorkspaceMetadataForPath('background.cdb');
  await settle();
  expect(state.getCardImageDocument(100)).not.toBe(null);
  expect(state.getCardImageDocument(200)).not.toBe(null);
  expect((disk.get('background.cdb')?.tasks?.recent as { label: string }[]).map(item => item.label))
    .toEqual(['second', 'first']);
});

test('activating a workspace during a background write waits for that transaction', async () => {
  state.loadWorkspaceMetadataForPath('other.cdb');
  await settle();
  const originalSave = save;
  let finish!: () => void;
  const blocked = new Promise<void>(resolve => { finish = resolve; });
  save = async (path, metadata) => { await blocked; return originalSave(path, metadata); };
  try {
    const writing = state.appendWorkspaceTaskHistoryForPath('activating.cdb', { kind: 'test', label: 'kept' });
    await settle();
    state.loadWorkspaceMetadataForPath('activating.cdb');
    await settle();
    expect(state.workspaceMetadataState.ready).toBe(false);
    finish();
    await writing;
    await settle();
    state.setCardShowcaseOutputDir('new output');
    state.loadWorkspaceMetadataForPath('activating.cdb');
    await settle();
    expect((disk.get('activating.cdb')?.tasks?.recent as { label: string }[])[0].label).toBe('kept');
    expect(state.getCardShowcaseOutputDir()).toBe('new output');
  } finally { finish(); save = originalSave; }
});

test('a failed metadata load never enables an empty autosave', async () => {
  const originalLoad = load;
  load = async () => { throw new Error('unreadable metadata'); };
  try {
    state.loadWorkspaceMetadataForPath('unreadable.cdb');
    await settle();
    state.setCardShowcaseOutputDir('must not save');
    expect(state.workspaceMetadataState.ready).toBe(false);
    expect(state.workspaceMetadataState.error).toContain('unreadable metadata');
    expect(writes.includes('unreadable.cdb')).toBe(false);
  } finally { load = originalLoad; }
});

test('each CDB keeps its pending metadata save when switching workspaces', async () => {
  state.loadWorkspaceMetadataForPath('switch-A.cdb');
  await settle();
  state.setCardShowcaseOutputDir('A-new');
  state.loadWorkspaceMetadataForPath('switch-B.cdb');
  await settle();
  state.setCardShowcaseOutputDir('B-new');
  await new Promise((resolve) => setTimeout(resolve, 750));
  expect(writes).toContain('switch-A.cdb');
  expect(writes).toContain('switch-B.cdb');
  state.loadWorkspaceMetadataForPath('switch-A.cdb');
  await settle();
  expect(state.getCardShowcaseOutputDir()).toBe('A-new');
});

test('returning before debounce expires flushes the latest metadata before loading', async () => {
  state.loadWorkspaceMetadataForPath('return-A.cdb');
  await settle();
  state.setCardShowcaseOutputDir('latest');
  state.loadWorkspaceMetadataForPath('return-B.cdb');
  await settle();
  state.loadWorkspaceMetadataForPath('return-A.cdb');
  await settle();
  expect(state.workspaceMetadataState.ready).toBe(true);
  expect(state.getCardShowcaseOutputDir()).toBe('latest');
});

test('old save responses cannot roll back edits, and later writes wait for earlier writes', async () => {
  const originalSave = save;
  let finish!: () => void;
  const blocked = new Promise<void>((resolve) => { finish = resolve; });
  let finishSecond!: () => void;
  const secondBlocked = new Promise<void>((resolve) => { finishSecond = resolve; });
  let calls = 0;
  save = async (path, metadata) => {
    calls += 1;
    if (calls === 1) await blocked;
    else if (calls === 2) await secondBlocked;
    return originalSave(path, metadata);
  };
  try {
    state.loadWorkspaceMetadataForPath('ordered.cdb');
    await settle();
    state.setCardShowcaseOutputDir('old');
    await new Promise((resolve) => setTimeout(resolve, 750));
    state.setCardShowcaseOutputDir('new');
    await new Promise((resolve) => setTimeout(resolve, 750));
    expect(calls).toBe(1);
    finish();
    await settle();
    expect(calls).toBe(2);
    expect(state.getCardShowcaseOutputDir()).toBe('new');
    finishSecond();
    await settle();
    state.setCardWorkspaceUi({ activeSurface: 'card', explorerPinned: true });
    state.loadWorkspaceMetadataForPath('ordered.cdb');
    await settle();
    expect(state.getCardShowcaseOutputDir()).toBe('new');
    expect((disk.get('ordered.cdb')?.ui?.cardShowcase as { outputDir: string }).outputDir).toBe('new');
  } finally {
    finish();
    finishSecond();
    save = originalSave;
  }
});

test('autosave failures remain visible and a later flush retries the retained snapshot', async () => {
  await state.loadWorkspaceMetadataForPath('retry.cdb');
  const originalSave = save;
  let attempts = 0;
  save = async () => { attempts++; throw new Error('disk unavailable'); };
  try {
    state.setCardShowcaseOutputDir('retained value');
    await new Promise(resolve => setTimeout(resolve, 750));
    expect(attempts).toBe(1);
    expect(Object.values(state.workspaceMetadataState.saveErrors)).toContainEqual({
      path: 'retry.cdb', message: 'Error: disk unavailable',
    });
    await expect(state.flushAllWorkspaceMetadataSaves()).rejects.toThrow('disk unavailable');
    expect(attempts).toBe(2);
    expect(disk.has('retry.cdb')).toBe(false);
    save = originalSave;
    await state.flushAllWorkspaceMetadataSaves();
    expect((disk.get('retry.cdb')?.ui?.cardShowcase as { outputDir: string }).outputDir).toBe('retained value');
    expect(Object.values(state.workspaceMetadataState.saveErrors)).toHaveLength(0);
  } finally { save = originalSave; await state.flushAllWorkspaceMetadataSaves(); }
});

test('new edits supersede a failed snapshot even after leaving the workspace', async () => {
  await state.loadWorkspaceMetadataForPath('retry-latest.cdb');
  const originalSave = save;
  save = async () => { throw new Error('read-only directory'); };
  try {
    state.setCardShowcaseOutputDir('old value');
    await expect(state.flushAllWorkspaceMetadataSaves()).rejects.toThrow('read-only directory');
    state.setCardShowcaseOutputDir('new value');
    await state.loadWorkspaceMetadataForPath('retry-other.cdb');
    save = originalSave;
    await state.flushAllWorkspaceMetadataSaves();
    expect((disk.get('retry-latest.cdb')?.ui?.cardShowcase as { outputDir: string }).outputDir).toBe('new value');
    expect(state.workspaceMetadataState.cdbPath).toBe('retry-other.cdb');
    expect(Object.values(state.workspaceMetadataState.saveErrors)).toHaveLength(0);
  } finally { save = originalSave; await state.flushAllWorkspaceMetadataSaves(); }
});

test('failed snapshots are retried before reloading their workspace', async () => {
  await state.loadWorkspaceMetadataForPath('retry-return.cdb');
  const originalSave = save;
  save = async () => { throw new Error('temporary failure'); };
  try {
    state.setCardShowcaseOutputDir('unsaved');
    await expect(state.flushAllWorkspaceMetadataSaves()).rejects.toThrow('temporary failure');
    await state.loadWorkspaceMetadataForPath('retry-away.cdb');
    await state.loadWorkspaceMetadataForPath('retry-return.cdb');
    expect(state.workspaceMetadataState.ready).toBe(false);
    expect(Object.values(state.workspaceMetadataState.saveErrors)).toHaveLength(1);
    save = originalSave;
    await state.loadWorkspaceMetadataForPath('retry-return.cdb');
    expect(state.workspaceMetadataState.ready).toBe(true);
    expect(state.getCardShowcaseOutputDir()).toBe('unsaved');
    expect(state.workspaceMetadataState.error).toBeNull();
    expect(Object.values(state.workspaceMetadataState.saveErrors)).toHaveLength(0);
  } finally { save = originalSave; await state.flushAllWorkspaceMetadataSaves(); }
});

test('retrying one path does not clear another workspace save error', async () => {
  const originalSave = save;
  try {
    save = async () => { throw new Error('failure'); };
    for (const path of ['failed-A.cdb', 'failed-B.cdb']) {
      await state.loadWorkspaceMetadataForPath(path);
      state.setCardShowcaseOutputDir(path);
      await expect(state.flushAllWorkspaceMetadataSaves()).rejects.toThrow('failure');
    }
    await settle();
    expect(Object.values(state.workspaceMetadataState.saveErrors)).toHaveLength(2);
    save = async (path, metadata) => {
      if (path === 'failed-B.cdb') throw new Error('still unavailable');
      return originalSave(path, metadata);
    };
    await expect(state.flushAllWorkspaceMetadataSaves()).rejects.toThrow('still unavailable');
    await settle();
    expect(Object.values(state.workspaceMetadataState.saveErrors).map(error => error.path)).toEqual(['failed-B.cdb']);
  } finally { save = originalSave; await state.flushAllWorkspaceMetadataSaves(); }
});

test('switching or updating an AI thread preserves token usage and conversation data', async () => {
  await state.loadWorkspaceMetadataForPath('ai-thread-update.cdb');
  const thread = state.upsertAiThread({ title: 'Original' });
  state.appendAiMessage({ threadId: thread.id, role: 'user', content: 'keep this message' });
  state.accumulateAiThreadTokenUsage({
    threadId: thread.id, promptTokens: 120, completionTokens: 30, totalTokens: 150,
  });
  const saved = state.getActiveAiThread()!;
  state.upsertAiThread(saved);
  expect(state.getActiveAiThread()?.tokenUsage).toEqual({
    promptTokens: 120, completionTokens: 30, totalTokens: 150,
  });
  state.upsertAiThread({ id: thread.id, title: 'Renamed', contextRefs: [{ type: 'card', label: 'New context' }] });
  expect(state.getActiveAiThread()?.title).toBe('Renamed');
  expect(state.getActiveAiThread()?.messages[0].content).toBe('keep this message');
  expect(state.getActiveAiThread()?.tokenUsage?.totalTokens).toBe(150);
  await state.flushAllWorkspaceMetadataSaves();
  await state.loadWorkspaceMetadataForPath('ai-thread-update.cdb');
  expect(state.getActiveAiThread()?.tokenUsage?.totalTokens).toBe(150);
});
