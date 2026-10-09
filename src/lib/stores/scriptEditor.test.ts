import * as bunTest from 'bun:test';
import { get, writable } from 'svelte/store';
import { DocumentRuntime } from '$lib/platform/runtime';
import { MemoryDocumentProvider } from '$lib/platform/memoryProvider';
import { cardModule, CARD_COLLECTION_TYPE } from '$lib/modules/card';
import { luaModule } from '$lib/modules/lua';
import type { CdbTab } from '$lib/stores/tabs';

const { test, expect } = bunTest;
const mock = (bunTest as unknown as {
  mock: { module: (specifier: string, factory: () => unknown) => void };
}).mock;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
let readText = async () => '-- script';
let afterQuery = async () => {};
class ScriptProvider extends MemoryDocumentProvider {
  async query(id: string) {
    const value = await super.query(id);
    await afterQuery();
    return value;
  }
}
let getInfo = async (_path: string, code: number) => ({ exists: true, path: `script/c${code}.lua` });
const runtime = new DocumentRuntime([
  cardModule, { ...luaModule, providers: luaModule.providers?.map((provider) => ({ ...provider, create: () => new ScriptProvider() })) },
  { id: 'test-cdb', providers: [{ id: 'test-cdb', typeIds: [CARD_COLLECTION_TYPE], create: () => new MemoryDocumentProvider() }] },
], {
  readText: () => readText(), writeText: async () => {},
  readBinary: async () => new Uint8Array(), writeBinary: async () => {},
});
const tabs = writable<CdbTab[]>([]);
const activeTabId = writable<string | null>(null);
mock.module('$lib/platform/appRuntime', () => ({ documentRuntime: runtime }));
mock.module('$lib/stores/db', () => ({ tabs, activeTabId }));
mock.module('$lib/stores/appShell.svelte', () => ({
  appShellState: { mainView: 'editor' }, activateEditorView() {}, activateScriptView() {},
}));
mock.module('$lib/native/scriptApi', () => ({ getCardScriptInfo: (path: string, code: number) => getInfo(path, code) }));
const scripts = await import('./scriptEditor.svelte');

async function createCdb() {
  const cdb = await runtime.createDocument({ typeId: CARD_COLLECTION_TYPE, providerId: 'test-cdb', title: 'A' });
  tabs.set([{ id: cdb.id, path: 'A.cdb' } as CdbTab]);
  return { cdbPath: 'A.cdb', sourceTabId: cdb.id, cardCode: 1, cardName: 'one' };
}
async function closeCdb(input: { sourceTabId: string; cdbPath: string }) {
  await scripts.closeScriptTabsForCdb({ tabId: input.sourceTabId, path: input.cdbPath });
  await runtime.close(input.sourceTabId, true);
  tabs.set([]);
}

test('closing a CDB cancels a script lookup before a document is opened', async () => {
  const input = await createCdb();
  const info = deferred<{ exists: boolean; path: string }>();
  const original = getInfo;
  getInfo = () => info.promise;
  try {
    const opening = scripts.openExistingScriptTab({ ...input, activate: false });
    await closeCdb(input);
    info.resolve({ exists: true, path: 'script/c1.lua' });
    expect(await opening).toBeNull();
    expect(get(scripts.scriptTabs)).toHaveLength(0);
    expect(runtime.snapshot.documents).toHaveLength(0);
    expect(runtime.snapshot.activeDocumentId).toBeNull();
  } finally { getInfo = original; }
});

test('closing a CDB during script file reading prevents late registration', async () => {
  const input = await createCdb();
  const reading = deferred<string>();
  const started = deferred<void>();
  const original = readText;
  readText = () => { started.resolve(); return reading.promise; };
  try {
    const opening = scripts.openExistingScriptTab(input);
    await started.promise;
    await closeCdb(input);
    reading.resolve('-- late script');
    expect(await opening).toBeNull();
    expect(runtime.snapshot.documents).toHaveLength(0);
    expect(get(scripts.scriptTabs)).toHaveLength(0);
  } finally { readText = original; }
});

test('background script restoration preserves active workspace', async () => {
  const input = await createCdb();
  const scriptId = await scripts.openExistingScriptTab({ ...input, activate: false });
  expect(runtime.snapshot.activeDocumentId).toBe(input.sourceTabId);
  expect(scriptId).not.toBe(null);
  expect(get(scripts.scriptTabs)[0].content).toBe('-- script');
  await closeCdb(input);
});

test('closing during hydration cannot add a script tab back after it was disposed', async () => {
  const input = await createCdb();
  const started = deferred<void>();
  const blocked = deferred<void>();
  const original = afterQuery;
  afterQuery = () => { started.resolve(); return blocked.promise; };
  try {
    const opening = scripts.openExistingScriptTab(input);
    await started.promise;
    expect(get(scripts.scriptTabs)).toHaveLength(1);
    await closeCdb(input);
    blocked.resolve();
    expect(await opening).toBeNull();
    expect(get(scripts.scriptTabs)).toHaveLength(0);
    expect(runtime.snapshot.documents).toHaveLength(0);
  } finally { afterQuery = original; blocked.resolve(); }
});

test('closing a CDB also cancels creation from a template', async () => {
  const input = await createCdb();
  const info = deferred<{ exists: boolean; path: string }>();
  const original = getInfo;
  getInfo = () => info.promise;
  try {
    const opening = scripts.openOrCreateScriptTab({ ...input, templateContent: '-- new' });
    await closeCdb(input);
    info.resolve({ exists: false, path: 'script/c1.lua' });
    expect(await opening).toBeNull();
    expect(runtime.snapshot.documents).toHaveLength(0);
  } finally { getInfo = original; }
});

test('an uncancelled template open still saves and activates its script', async () => {
  const input = await createCdb();
  const original = getInfo;
  getInfo = async () => ({ exists: false, path: 'script/c1.lua' });
  try {
    const opened = await scripts.openOrCreateScriptTab({ ...input, templateContent: '-- new' });
    expect(opened?.createdFromTemplate).toBe(true);
    expect(runtime.snapshot.activeDocumentId).toBe(opened?.tabId);
    expect(get(scripts.scriptTabs)[0].savedContent).toBe('-- new');
    expect(get(scripts.scriptTabs)[0].isDirty).toBe(false);
    await closeCdb(input);
  } finally { getInfo = original; }
});
