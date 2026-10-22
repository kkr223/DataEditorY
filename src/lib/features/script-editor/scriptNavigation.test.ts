import { expect, test } from 'bun:test';
import { posix } from 'node:path';
import { createScriptNavigation, type ScriptNavigationDependencies } from './scriptNavigation';

function setup() {
  const source = { id: 'source', sourceTabId: 'cdb', cdbPath: '/cards/cards.cdb', scriptPath: '/cards/script/sub/c1.lua' };
  let activeOwner = 'cdb';
  let activeScript = 'source';
  let opened: Parameters<ScriptNavigationDependencies['open']>[0] | undefined;
  const disk = new Set<string>();
  const openTabs = [source];
  const dependencies: ScriptNavigationDependencies = {
    getSource: () => source, getTabs: () => openTabs,
    getActiveOwner: () => activeOwner, getActiveScript: () => activeScript,
    getDirectories: () => ({ scriptDirectory: '/custom/scripts', ygoproPath: '/ygopro/client.exe' }),
    dirname: async (path) => posix.dirname(path), join: async (...parts) => posix.normalize(posix.join(...parts)),
    exists: async (path) => disk.has(path), getCardScriptInfo: async (_path, code) => ({ path: `/cards/script/c${code}.lua` }),
    open: async (input) => { opened = input; return 'dependency'; },
  };
  return { source, dependencies, disk, openTabs, navigation: createScriptNavigation(dependencies),
    opened: () => opened, switchOwner: () => { activeOwner = 'other'; }, switchScript: () => { activeScript = 'other'; } };
}

test('LoadScript searches relative paths, CDB scripts, configured scripts and game scripts', async () => {
  const state = setup();
  for (const path of ['/cards/script/sub/helper.lua', '/cards/script/helper.lua', '/custom/scripts/helper.lua', '/ygopro/script/helper.lua']) {
    state.disk.clear(); state.disk.add(path);
    expect(await state.navigation.resolve('source-uri', 'helper.lua')).toBe(path);
  }
  state.disk.clear(); state.disk.add('/cards/script/helper.lua');
  expect(await state.navigation.resolve('source-uri', '../helper.lua')).toBe('/cards/script/helper.lua');
  expect(await state.navigation.resolve('source-uri', '/cards/script/helper.lua')).toBe('/cards/script/helper.lua');
  expect(await state.navigation.resolve('source-uri', 'missing.lua')).toBeNull();
});

test('open buffers are preferred even when their file no longer exists', async () => {
  const state = setup();
  state.openTabs.push({ ...state.source, id: 'helper', scriptPath: '/cards/script/sub/helper.lua' });
  expect(await state.navigation.resolve('source-uri', 'helper.lua')).toBe('/cards/script/sub/helper.lua');
  expect(await state.navigation.open('source-uri', '/cards/script/sub/helper.lua')).toBe(true);
  expect(state.opened()?.cardCode).toBe(0);
  expect(state.opened()?.sourceTabId).toBe('cdb');
});

test('only canonical card scripts receive card metadata', async () => {
  const state = setup();
  await state.navigation.open('source-uri', '/cards/script/c123.lua');
  expect(state.opened()?.cardCode).toBe(123);
  await state.navigation.open('source-uri', '/other/c123.lua');
  expect(state.opened()?.cardCode).toBe(0);
});

test('late navigation cannot activate a workspace or script the user has left', async () => {
  const state = setup();
  await state.navigation.open('source-uri', '/cards/script/helper.lua');
  expect(state.opened()?.canActivate()).toBe(true);
  state.switchScript();
  expect(state.opened()?.canActivate()).toBe(false);
  state.switchOwner();
  expect(await state.navigation.open('source-uri', '/cards/script/helper.lua')).toBe(false);
});

test('switching CDB while card metadata is read cancels activation', async () => {
  const state = setup();
  state.dependencies.getCardScriptInfo = async () => { state.switchOwner(); return { path: '/cards/script/c123.lua' }; };
  expect(await state.navigation.open('source-uri', '/cards/script/c123.lua')).toBe(false);
  expect(state.opened()).toBe(undefined);
});

test('file resolution does not steal focus after another script was selected', async () => {
  const state = setup();
  state.dependencies.exists = async () => { state.switchScript(); return true; };
  expect(await state.navigation.follow('source-uri', 'helper.lua')).toBe('cancelled');
  expect(state.opened()).toBe(undefined);
});

test('empty configured directories do not search the process working directory', async () => {
  const state = setup();
  state.dependencies.getDirectories = () => ({ scriptDirectory: '', ygoproPath: '' });
  state.disk.add('helper.lua');
  expect(await state.navigation.resolve('source-uri', 'helper.lua')).toBeNull();
  expect(await state.navigation.follow('source-uri', 'helper.lua')).toBe('missing');
});
