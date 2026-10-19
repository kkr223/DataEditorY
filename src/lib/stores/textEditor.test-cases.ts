import * as bunTest from 'bun:test';
import { get, writable } from 'svelte/store';
import type { editor } from 'monaco-editor';

const { expect, test } = bunTest;
const mock = (bunTest as unknown as {
  mock: { module: (specifier: string, factory: () => unknown) => void };
}).mock;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
let read = async (_path: string) => 'original';
let write = async (_path: string, _content: string) => {};
mock.module('$lib/native/assetApi', () => ({
  readTextFile: (path: string) => read(path),
  writeTextFile: (path: string, content: string) => write(path, content),
}));
mock.module('svelte-i18n', () => ({ _: writable((key: string) => key) }));
mock.module('$lib/infrastructure/tauri', () => ({ tauriBridge: {} }));
mock.module('$lib/stores/appShell.svelte', () => ({ activateTextView() {}, activateEditorView() {} }));
mock.module('$lib/stores/toast.svelte', () => ({ showToast() {} }));
const texts = await import('./textEditor.svelte');
const lifecycle = await import('$lib/application/workspace/lifecycle');
const models = await import('$lib/features/script-editor/monaco/textModels');
const tab = (id: string) => get(texts.textTabs).find(item => item.id === id)!;

test('reloading a background tab updates only its own buffer and saved baseline', async () => {
  const a = (await texts.openTextFile('reload-A.txt'))!;
  const b = (await texts.openTextFile('reload-B.txt'))!;
  const pending = deferred<string>();
  const originalRead = read;
  read = () => pending.promise;
  try {
    texts.activateTextTab(a);
    const reloading = texts.reloadTextTab(a);
    texts.activateTextTab(b);
    texts.updateTextTabContent(b, 'B unsaved');
    pending.resolve('A disk\r\n');
    expect(await reloading).toBe(true);
    expect(tab(a).content).toBe('A disk\n');
    expect(tab(a).isDirty).toBe(false);
    expect(tab(b).content).toBe('B unsaved');
    expect(get(texts.activeTextTabId)).toBe(b);
  } finally { read = originalRead; await texts.closeTextTab(a); await texts.closeTextTab(b); }
});

test('reload cannot overwrite intervening edits or resurrect a closed tab', async () => {
  const id = (await texts.openTextFile('reload-stale.txt'))!;
  const originalRead = read;
  const pending = deferred<string>();
  read = () => pending.promise;
  try {
    const reloading = texts.reloadTextTab(id);
    texts.updateTextTabContent(id, 'typed while reading');
    pending.resolve('stale disk');
    expect(await reloading).toBe(false);
    expect(tab(id).content).toBe('typed while reading');
    const late = deferred<string>();
    read = () => late.promise;
    const closingReload = texts.reloadTextTab(id);
    await texts.closeTextTab(id);
    late.resolve('late result');
    expect(await closingReload).toBe(false);
    expect(tab(id)).toBe(undefined);
  } finally { read = originalRead; await texts.closeTextTab(id); }
});

test('saving acknowledges only the content actually written', async () => {
  const id = (await texts.openTextFile('saving.txt'))!;
  const started = deferred<void>();
  const blocked = deferred<void>();
  const originalWrite = write;
  let persisted = '';
  write = async (_path, content) => { started.resolve(); await blocked.promise; persisted = content; };
  try {
    texts.updateTextTabContent(id, 'first');
    const saving = texts.saveTextTab(id);
    await started.promise;
    texts.updateTextTabContent(id, 'second');
    blocked.resolve();
    expect(await saving).toBe(true);
    expect(persisted).toBe('first');
    expect(tab(id).savedContent).toBe('first');
    expect(tab(id).isDirty).toBe(true);
  } finally { blocked.resolve(); write = originalWrite; await texts.closeTextTab(id); }
});

test('closing an inactive text tab releases its model and save handler exactly once', async () => {
  const a = (await texts.openTextFile('close-A.lua'))!;
  const b = (await texts.openTextFile('close-B.txt'))!;
  let disposed = 0;
  let cleared = 0;
  models.registerTextTabModel(a, { dispose: () => { disposed++; } } as editor.ITextModel, () => { cleared++; });
  await texts.closeTextTab(a);
  await texts.closeTextTab(a);
  expect(disposed).toBe(1);
  expect(cleared).toBe(1);
  expect(lifecycle.tryRunWorkspaceSaveHandler(a)).toBeNull();
  expect(get(texts.activeTextTabId)).toBe(b);
  await texts.closeTextTab(b);
});

test('reload waits for a pending save and a later save invalidates an old reload', async () => {
  const id = (await texts.openTextFile('reload-save.txt'))!;
  const originalRead = read;
  const originalWrite = write;
  const writing = deferred<void>();
  const finish = deferred<void>();
  let disk = 'original';
  let reads = 0;
  write = async (_path, content) => { writing.resolve(); await finish.promise; disk = content; };
  read = async () => { reads++; return disk; };
  try {
    texts.updateTextTabContent(id, 'saved');
    const saving = texts.saveTextTab(id);
    await writing.promise;
    const reloading = texts.reloadTextTab(id);
    await Promise.resolve();
    expect(reads).toBe(0);
    finish.resolve();
    expect(await saving).toBe(true);
    expect(await reloading).toBe(true);
    expect(tab(id).content).toBe('saved');

    const reading = deferred<void>();
    const stale = deferred<string>();
    read = () => { reading.resolve(); return stale.promise; };
    const oldReload = texts.reloadTextTab(id);
    await reading.promise;
    expect(await texts.saveTextTab(id)).toBe(true);
    stale.resolve('stale');
    expect(await oldReload).toBe(false);
    expect(tab(id).content).toBe('saved');
  } finally {
    finish.resolve();
    read = originalRead;
    write = originalWrite;
    await texts.closeTextTab(id);
  }
});
