import * as bunTest from 'bun:test';
import { get, writable } from 'svelte/store';
import { DocumentRuntime } from '#lib/platform/runtime.ts';
import { MemoryDocumentProvider } from '#lib/platform/memoryProvider.ts';

const { test, expect } = bunTest;
const mock = (bunTest as unknown as {
  mock: { module: (specifier: string, factory: () => unknown) => void };
}).mock;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

let save = async () => {};
let pickPath = async (): Promise<string | null> => 'created.cdb';
let disposed = 0;
const errors: string[] = [];
class Provider extends MemoryDocumentProvider {
  async dispose(id: string) { disposed++; await super.dispose(id); }
}
const runtime = new DocumentRuntime([{
  id: 'test',
  dataTypes: [{ typeId: 'cards', version: 1, validate: (value) => value }],
  providers: [{ id: 'cdb.provider', typeIds: ['cards'], create: () => new Provider() }],
  codecs: [{
    id: 'cdb.codec', typeId: 'cards', filePatterns: ['.cdb'],
    decode: async (source) => ({ typeId: 'cards', schemaVersion: 1, title: source.name, providerId: 'cdb.provider' }),
    encode: () => save(),
  }],
}], {
  readText: async () => '', writeText: async () => {},
  readBinary: async () => new Uint8Array(), writeBinary: async () => {},
});
mock.module('#lib/platform/appRuntime.ts', () => ({ documentRuntime: runtime }));
mock.module('#lib/modules/card/index.ts', () => ({ CARD_COLLECTION_TYPE: 'cards' }));
mock.module('#lib/modules/cdb/index.ts', () => ({ CDB_PROVIDER_ID: 'cdb.provider' }));
mock.module('#lib/infrastructure/tauri/index.ts', () => ({ tauriBridge: { save: () => pickPath() } }));
mock.module('#lib/stores/search.ts', () => ({
  parseCachedFiltersJson: () => ({}), clearSourceFilterCacheForTab() {}, refreshCachedSearchForTab() {},
}));
mock.module('#lib/utils/errorLog.ts', () => ({ writeErrorLog: async (input: { source: string }) => { errors.push(input.source); } }));
mock.module('#lib/stores/toast.svelte.ts', () => ({ showToast() {} }));
mock.module('svelte-i18n', () => ({ _: writable((key: string) => key) }));
let initializeMetadata = async (_path: string) => {};
mock.module('#lib/features/workspace-metadata/state.svelte.ts', () => ({
  initializeWorkspaceMetadataForNewCdb: (path: string) => initializeMetadata(path),
}));
const tabs = await import('./tabs');

test('first save finishes before the new workspace is activated', async () => {
  const started = deferred<void>();
  const finish = deferred<void>();
  save = async () => { started.resolve(); await finish.promise; };
  const creating = tabs.createCdbFile('new.cdb');
  await started.promise;
  try {
    expect(runtime.snapshot.activeDocumentId).toBeNull();
    expect(runtime.snapshot.documents).toHaveLength(0);
    expect(get(tabs.tabs)).toHaveLength(0);
    expect(get(tabs.activeTab)).toBeNull();
  } finally { finish.resolve(); }
  const id = await creating;
  expect(runtime.snapshot.activeDocumentId).toBe(id);
  expect(get(tabs.activeTab)?.path).toBe('new.cdb');
  await runtime.close(id!, true);
  save = async () => {};
});

test('rapid create actions share one native dialog and create one document', async () => {
  const selected = deferred<string | null>();
  let dialogs = 0;
  pickPath = () => { dialogs++; return selected.promise; };
  const first = tabs.createCdbFile();
  const second = tabs.createCdbFile();
  expect(dialogs).toBe(1);
  selected.resolve('shared.cdb');
  const [a, b] = await Promise.all([first, second]);
  expect(a).toBe(b);
  expect(runtime.snapshot.documents).toHaveLength(1);
  await runtime.close(a!, true);
});

test('save failure disposes the partial document and permits a retry', async () => {
  const previous = disposed;
  save = async () => { throw new Error('disk is read-only'); };
  expect(await tabs.createCdbFile('retry.cdb')).toBeNull();
  expect(runtime.snapshot.documents).toHaveLength(0);
  expect(disposed).toBe(previous + 1);
  expect(errors).toContain('tabs.create');
  save = async () => {};
  const id = await tabs.createCdbFile('retry.cdb');
  expect(typeof id).toBe('string');
  await runtime.close(id!, true);
});

test('dialog errors and cancellation do not reject or create documents', async () => {
  pickPath = async () => { throw new Error('dialog failed'); };
  expect(await tabs.createCdbFile()).toBeNull();
  pickPath = async () => null;
  expect(await tabs.createCdbFile()).toBeNull();
  expect(runtime.snapshot.documents).toHaveLength(0);
});

test('opening the target while creating waits for its first save', async () => {
  const started = deferred<void>();
  const finish = deferred<void>();
  save = async () => { started.resolve(); await finish.promise; };
  const creating = tabs.createCdbFile('same.cdb');
  await started.promise;
  const opening = tabs.openCdbPath('same.cdb');
  const duplicate = await tabs.createCdbFile('same.cdb');
  finish.resolve();
  const id = await creating;
  expect(duplicate).toBeNull();
  expect(await opening).toBe(id);
  expect(runtime.snapshot.documents).toHaveLength(1);
  await runtime.close(id!, true);
  save = async () => {};
});

test('finishing creation preserves a workspace activated while saving', async () => {
  const existing = await runtime.createDocument({ typeId: 'cards', providerId: 'cdb.provider', title: 'existing' });
  const other = await runtime.createDocument({ typeId: 'cards', providerId: 'cdb.provider', title: 'other' });
  runtime.activate(existing.id);
  const started = deferred<void>();
  const finish = deferred<void>();
  save = async () => { started.resolve(); await finish.promise; };
  const creating = tabs.createCdbFile('background.cdb');
  await started.promise;
  runtime.activate(other.id);
  finish.resolve();
  const id = await creating;
  expect(runtime.snapshot.activeDocumentId).toBe(other.id);
  await runtime.close(id!, true);
  await runtime.close(existing.id, true);
  await runtime.close(other.id, true);
  save = async () => {};
});

test('closing the last workspace cannot activate a partly saved document', async () => {
  const existing = await runtime.createDocument({ typeId: 'cards', providerId: 'cdb.provider', title: 'existing' });
  const started = deferred<void>();
  const finish = deferred<void>();
  save = async () => { started.resolve(); await finish.promise; };
  const creating = tabs.createCdbFile('closing.cdb');
  await started.promise;
  await runtime.close(existing.id, true);
  expect(runtime.snapshot.documents).toHaveLength(0);
  expect(runtime.snapshot.activeDocumentId).toBeNull();
  finish.resolve();
  const id = await creating;
  expect(runtime.snapshot.activeDocumentId).toBeNull();
  await runtime.close(id!, true);
  save = async () => {};
});

test('a new CDB initializes its own metadata after saving and before activation', async () => {
  const previous = initializeMetadata;
  let initialized = false;
  initializeMetadata = async (path) => {
    expect(path).toBe('recreated.cdb');
    expect(runtime.snapshot.activeDocumentId).toBeNull();
    initialized = true;
  };
  try {
    const id = await tabs.createCdbFile('recreated.cdb');
    expect(initialized).toBe(true);
    expect(runtime.snapshot.activeDocumentId).toBe(id);
    await runtime.close(id!, true);
  } finally { initializeMetadata = previous; }
});

test('metadata initialization failures close the partial workspace and allow retry', async () => {
  const previous = initializeMetadata;
  initializeMetadata = async () => { throw new Error('metadata is read-only'); };
  try {
    expect(await tabs.createCdbFile('reset-failed.cdb')).toBeNull();
    expect(runtime.snapshot.documents).toHaveLength(0);
  } finally { initializeMetadata = previous; }
  const id = await tabs.createCdbFile('reset-failed.cdb');
  expect(typeof id).toBe('string');
  await runtime.close(id!, true);
});
