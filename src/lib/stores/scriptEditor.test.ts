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
let afterExecute = async () => {};
class ScriptProvider extends MemoryDocumentProvider {
  async query(id: string) {
    const value = await super.query(id);
    await afterQuery();
    return value;
  }
  async execute(id: string, command: unknown) {
    const result = await super.execute(id, command);
    await afterExecute();
    return result;
  }
}
let getInfo = async (_path: string, code: number) => ({ exists: true, path: `script/c${code}.lua` });
const writtenPaths: string[] = [];
const runtime = new DocumentRuntime([
  cardModule, { ...luaModule, providers: luaModule.providers?.map((provider) => ({ ...provider, create: () => new ScriptProvider() })) },
  { id: 'test-cdb', providers: [{ id: 'test-cdb', typeIds: [CARD_COLLECTION_TYPE], create: () => new MemoryDocumentProvider() }] },
], {
  readText: () => readText(), writeText: async (path) => { writtenPaths.push(path); },
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

test('dependency scripts have distinct paths and reopening preserves unsaved content', async () => {
  const input = await createCdb();
  const first = await scripts.openExistingScriptTab({ ...input, cardCode: 0, scriptPath: 'script/helper.lua' });
  const second = await scripts.openExistingScriptTab({ ...input, cardCode: 0, scriptPath: 'script/other.lua' });
  if (!first || !second) throw new Error('Expected dependency tabs');
  scripts.updateScriptTabContent(first, '-- unsaved helper');
  const reopened = await scripts.openExistingScriptTab({ ...input, cardCode: 0, scriptPath: 'script/helper.lua' });
  expect(reopened).toBe(first);
  expect(get(scripts.scriptTabs)).toHaveLength(2);
  expect(get(scripts.scriptTabs).find((tab) => tab.id === first)?.content).toBe('-- unsaved helper');
  expect(scripts.getScriptTabDisplayName(get(scripts.scriptTabs)[0])).toBe('helper.lua');
  await scripts.saveScriptTab(first);
  expect(writtenPaths.at(-1)).toBe('script/helper.lua');
  await closeCdb(input);
  expect(get(scripts.scriptTabs)).toHaveLength(0);
});

test('concurrent dependency opens read once and late activation guards remain effective', async () => {
  const input = await createCdb();
  const reading = deferred<string>();
  const started = deferred<void>();
  const original = readText;
  let reads = 0;
  let current = true;
  readText = () => { reads += 1; started.resolve(); return reading.promise; };
  try {
    const options = { ...input, cardCode: 0, scriptPath: 'script/concurrent.lua', activate: true, canActivate: () => current };
    const first = scripts.openExistingScriptTab(options);
    await started.promise;
    const second = scripts.openExistingScriptTab(options);
    current = false;
    reading.resolve('-- dependency');
    expect(await first).toBe(await second);
    expect(reads).toBe(1);
    expect(runtime.snapshot.activeDocumentId).toBe(input.sourceTabId);
  } finally { readText = original; await closeCdb(input); }
});

test('two CDBs loading the same dependency keep separate owned buffers', async () => {
  const first = await createCdb();
  const firstId = await scripts.openExistingScriptTab({ ...first, cardCode: 0, scriptPath: '/shared/helper.lua' });
  if (!firstId) throw new Error('Expected first dependency');
  scripts.updateScriptTabContent(firstId, '-- first workspace edits');
  const secondOwner = await runtime.createDocument({ typeId: CARD_COLLECTION_TYPE, providerId: 'test-cdb', title: 'B' });
  const second = { ...first, sourceTabId: secondOwner.id, cdbPath: 'B.cdb' };
  tabs.update((current) => [...current, { id: secondOwner.id, path: 'B.cdb' } as CdbTab]);
  const secondId = await scripts.openExistingScriptTab({ ...second, cardCode: 0, scriptPath: '/shared/helper.lua' });
  expect(firstId === secondId).toBe(false);
  expect(get(scripts.scriptTabs).find((tab) => tab.id === firstId)?.content).toBe('-- first workspace edits');
  expect(get(scripts.scriptTabs).find((tab) => tab.id === firstId)?.sourceTabId).toBe(first.sourceTabId);
  expect(get(scripts.scriptTabs).find((tab) => tab.id === secondId)?.sourceTabId).toBe(second.sourceTabId);
  await scripts.closeScriptTabsForCdb({ tabId: first.sourceTabId, path: first.cdbPath });
  await runtime.close(first.sourceTabId, true);
  tabs.update((current) => current.filter((tab) => tab.id !== first.sourceTabId));
  expect(get(scripts.scriptTabs).map((tab) => tab.id)).toEqual([secondId!]);
  await closeCdb(second);
});

test('a card script opened through LoadScript shares an in-flight card navigation', async () => {
  const input = await createCdb();
  const reading = deferred<string>();
  const started = deferred<void>();
  const original = readText;
  let reads = 0;
  readText = () => { reads += 1; started.resolve(); return reading.promise; };
  try {
    const fromCard = scripts.openExistingScriptTab(input);
    await started.promise;
    const fromLink = scripts.openExistingScriptTab({ ...input, scriptPath: 'script/c1.lua' });
    reading.resolve('-- card script');
    expect(await fromCard).toBe(await fromLink);
    expect(reads).toBe(1);
    expect(get(scripts.scriptTabs)).toHaveLength(1);
  } finally { readText = original; await closeCdb(input); }
});

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

test('restoring an active script cannot reactivate a workspace left during buffer synchronization', async () => {
  const input = await createCdb();
  const first = await scripts.openExistingScriptTab({ ...input, activate: false });
  const second = await scripts.openExistingScriptTab({ ...input, cardCode: 2, activate: false });
  if (!first || !second) throw new Error('Expected two scripts');
  await scripts.activateScriptTab(first);
  scripts.updateScriptTabContent(first, '-- pending buffer');
  const started = deferred<void>();
  const blocked = deferred<void>();
  const original = afterExecute;
  let stillCurrentWorkspace = true;
  afterExecute = () => { started.resolve(); return blocked.promise; };
  try {
    const restoring = scripts.activateScriptTab(second, undefined, () => stillCurrentWorkspace);
    await started.promise;
    stillCurrentWorkspace = false;
    blocked.resolve();
    await restoring;
    expect(get(scripts.activeScriptTabId)).toBe(first);
    expect(get(scripts.scriptTabs).find((tab) => tab.id === first)?.content).toBe('-- pending buffer');
    await scripts.activateScriptTab(second);
    expect(get(scripts.activeScriptTabId)).toBe(second);
  } finally {
    blocked.resolve();
    afterExecute = original;
    await closeCdb(input);
  }
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

test('background template creation saves the file without changing the active workspace or script', async () => {
  const input = await createCdb();
  const first = await scripts.openExistingScriptTab({ ...input, activate: true });
  const info = deferred<{ exists: boolean; path: string }>();
  const original = getInfo;
  getInfo = () => info.promise;
  try {
    const opening = scripts.openOrCreateScriptTab({
      ...input, cardCode: 2, templateContent: '-- selected card 2', activate: false,
    });
    runtime.activate(input.sourceTabId);
    writtenPaths.length = 0;
    info.resolve({ exists: false, path: 'script/c2.lua' });
    const result = await opening;
    expect(result?.createdFromTemplate).toBe(true);
    expect(writtenPaths).toEqual(['script/c2.lua']);
    expect(runtime.snapshot.activeDocumentId).toBe(input.sourceTabId);
    expect(get(scripts.activeScriptTabId)).toBe(first);
    const created = get(scripts.scriptTabs).find((tab) => tab.id === result?.tabId);
    expect(created?.content).toBe('-- selected card 2');
    expect(created?.isDirty).toBe(false);
    // Reopening the already open script must also respect background activation.
    await scripts.openOrCreateScriptTab({ ...input, cardCode: 2, templateContent: '-- do not overwrite', activate: false });
    expect(get(scripts.activeScriptTabId)).toBe(first);
    expect(get(scripts.scriptTabs).find((tab) => tab.id === result?.tabId)?.content).toBe('-- selected card 2');
  } finally {
    getInfo = original;
    await closeCdb(input);
  }
});

test('an explicit open can activate a script already being created in the background', async () => {
  const input = await createCdb();
  const info = deferred<{ exists: boolean; path: string }>();
  const original = getInfo;
  getInfo = () => info.promise;
  try {
    const background = scripts.openOrCreateScriptTab({ ...input, templateContent: '-- new', activate: false });
    const explicit = scripts.openOrCreateScriptTab({ ...input, templateContent: '-- new' });
    info.resolve({ exists: false, path: 'script/c1.lua' });
    const [first, second] = await Promise.all([background, explicit]);
    expect(first?.tabId).toBe(second?.tabId);
    expect(get(scripts.scriptTabs)).toHaveLength(1);
    expect(get(scripts.activeScriptTabId)).toBe(second?.tabId);
  } finally {
    getInfo = original;
    await closeCdb(input);
  }
});

test('moving a card ID retargets an open script and preserves its unsaved buffer', async () => {
  const input = await createCdb();
  const scriptId = await scripts.openExistingScriptTab(input);
  if (!scriptId) throw new Error('Expected script');
  scripts.updateScriptTabContent(scriptId, '-- unsaved');
  const change = { originalCardId: 1, newCardId: 2, removeOriginal: true, cdbPath: input.cdbPath };
  scripts.syncScriptTabsAfterCardIdChange(input.sourceTabId, change);
  expect(get(scripts.scriptTabs)[0].cardCode).toBe(2);
  expect(get(scripts.scriptTabs)[0].content).toBe('-- unsaved');
  expect(get(scripts.scriptTabs)[0].isDirty).toBe(true);
  expect(runtime.getDocument(scriptId)?.source?.path).toBe('script/c2.lua');
  writtenPaths.length = 0;
  await scripts.saveScriptTab(scriptId);
  expect(writtenPaths).toEqual(['script/c2.lua']);
  scripts.syncScriptTabsAfterCardIdChange(input.sourceTabId, { ...change, reversed: true });
  expect(get(scripts.scriptTabs)[0].cardCode).toBe(1);
  expect(runtime.getDocument(scriptId)?.source?.path).toBe('script/c1.lua');
  await closeCdb(input);
});

test('copying a card ID keeps its original open script at the original path', async () => {
  const input = await createCdb();
  const scriptId = await scripts.openExistingScriptTab(input);
  scripts.syncScriptTabsAfterCardIdChange(input.sourceTabId, {
    originalCardId: 1, newCardId: 2, removeOriginal: false, cdbPath: input.cdbPath,
  });
  expect(get(scripts.scriptTabs)[0].cardCode).toBe(1);
  expect(runtime.getDocument(scriptId!)?.source?.path).toBe('script/c1.lua');
  await closeCdb(input);
});

test('script tab moves keep buffers and activation intact and stay inside their CDB', async () => {
  const input = await createCdb();
  const other = await runtime.createDocument({ typeId: CARD_COLLECTION_TYPE, providerId: 'test-cdb', title: 'B' });
  const otherInput = { ...input, sourceTabId: other.id, cdbPath: 'B.cdb', cardCode: 9 };
  tabs.update((current) => [...current, { id: other.id, path: 'B.cdb' } as CdbTab]);
  try {
    const first = await scripts.openExistingScriptTab({ ...input, activate: false });
    const second = await scripts.openExistingScriptTab({ ...input, cardCode: 2, activate: false });
    const third = await scripts.openExistingScriptTab({ ...input, cardCode: 3, activate: false });
    const unrelated = await scripts.openExistingScriptTab({ ...otherInput, activate: false });
    if (!first || !second || !third || !unrelated) throw new Error('Expected four scripts');
    await scripts.activateScriptTab(first);
    scripts.updateScriptTabContent(third, '-- unsaved after reorder');
    scripts.moveScriptTab(third, first, 'before');
    const owned = () => scripts.getScriptTabsForCdb({ tabId: input.sourceTabId, path: input.cdbPath });
    expect(owned().map((tab) => tab.id)).toEqual([third, first, second]);
    expect(get(scripts.activeScriptTabId)).toBe(first);
    expect(owned()[0].content).toBe('-- unsaved after reorder');
    expect(owned()[0].isDirty).toBe(true);
    runtime.patchMetadata(first, { cardName: 'renamed' });
    expect(owned().map((tab) => tab.id)).toEqual([third, first, second]);
    scripts.moveScriptTab(first, unrelated, 'after');
    expect(owned().map((tab) => tab.id)).toEqual([third, first, second]);
    expect(scripts.getScriptTabsForCdb({ tabId: other.id, path: 'B.cdb' }).map((tab) => tab.id)).toEqual([unrelated]);
    await scripts.closeScriptTab(first);
    expect(get(scripts.activeScriptTabId)).toBe(second);
  } finally {
    await closeCdb(otherInput);
    await closeCdb(input);
  }
});
