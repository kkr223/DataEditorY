import * as bunTest from 'bun:test';
import type { WorkspaceMetadata } from '$lib/native/metadataApi';

const { test, expect } = bunTest;
const mock = (bunTest as unknown as {
  mock: { module: (specifier: string, factory: () => unknown) => void };
}).mock;
const disk = new Map<string, WorkspaceMetadata>();
const writes: string[] = [];
let save = async (path: string, metadata: WorkspaceMetadata) => {
  disk.set(path, metadata);
  writes.push(path);
  return metadata;
};
mock.module('$lib/native/metadataApi', () => ({
  loadWorkspaceMetadata: async (path: string) => disk.get(path) ?? { version: 1, cdbPath: path },
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
