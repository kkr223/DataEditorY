import { expect, test } from 'bun:test';
import { WebFileStore } from './webFiles.ts';

function stores() {
  const values = new Map<string, string>();
  const files = new Map<string, Uint8Array>();
  const storage = () => ({
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  });
  return () => new WebFileStore(storage, {
    read: async (path) => files.get(path),
    write: async (path, bytes) => { files.set(path, bytes.slice()); },
  });
}

test('workspace identity survives reimporting in a different order after reload', async () => {
  const createStore = stores();
  const first = createStore();
  const a = new File(['a'], 'a.cdb');
  const b = new File(['b'], 'b.cdb');
  const aId = await first.workspaceId(await first.import(a));
  const bId = await first.workspaceId(await first.import(b));
  const reloaded = createStore();
  expect(await reloaded.workspaceId(await reloaded.import(b))).toBe(bId);
  expect(await reloaded.workspaceId(await reloaded.import(a))).toBe(aId);
});

test('same-name files with different contents have independent workspaces', async () => {
  const store = stores()();
  const first = await store.import(new File(['a'], 'cards.cdb'));
  const second = await store.import(new File(['b'], 'cards.cdb'));
  expect(first).not.toBe(second);
  expect(await store.workspaceId(first)).not.toBe(await store.workspaceId(second));
});

test('saved revisions restore metadata identity when downloaded and reimported', async () => {
  const createStore = stores();
  const store = createStore();
  const path = await store.import(new File(['original'], 'cards.cdb'));
  const id = await store.workspaceId(path);
  const saved = new TextEncoder().encode('edited');
  await store.write(path, saved);
  const reloaded = createStore();
  const imported = await reloaded.import(new File([saved], 'cards.cdb'));
  expect(await reloaded.workspaceId(imported)).toBe(id);
});

test('save as keeps source and destination workspace identities independent', async () => {
  const store = stores()();
  const source = await store.import(new File(['original'], 'cards.cdb'));
  const id = await store.workspaceId(source);
  const destination = 'vfs://exports/new/other.cdb';
  await store.write(destination, await store.read(source));
  expect(await store.workspaceId(destination)).not.toBe(id);
  expect(await store.workspaceId(source)).toBe(id);
});

test('recent paths restore imported bytes after a page reload', async () => {
  const createStore = stores();
  const path = await createStore().import(new File(['original'], 'cards.cdb'));
  const reloaded = createStore();
  expect(await reloaded.exists(path)).toBe(true);
  expect(new TextDecoder().decode(await reloaded.read(path))).toBe('original');
  expect(await reloaded.exists('vfs://imports/old/missing.cdb')).toBe(false);
});

test('recent paths restore the latest saved snapshot and its workspace identity', async () => {
  const createStore = stores();
  const store = createStore();
  const path = await store.import(new File(['original'], 'cards.cdb'));
  const id = await store.workspaceId(path);
  await store.write(path, new TextEncoder().encode('saved'));
  const reloaded = createStore();
  expect(new TextDecoder().decode(await reloaded.read(path))).toBe('saved');
  expect(await reloaded.workspaceId(path)).toBe(id);
});

test('recent paths restore newly created and exported CDB files', async () => {
  const createStore = stores();
  const path = 'vfs://exports/new/cards.cdb';
  await createStore().write(path, new TextEncoder().encode('exported'));
  expect(new TextDecoder().decode(await createStore().read(path))).toBe('exported');
});
