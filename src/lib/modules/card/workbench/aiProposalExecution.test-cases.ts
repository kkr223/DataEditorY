import * as bunTest from 'bun:test';
import { createEmptyCard } from '$lib/domain/card/draft';
import { createScriptBaseline } from '$lib/features/ai/scriptBaseline';
import type { WorkspaceAiPatch } from '$lib/features/ai/types';

const { test, expect } = bunTest;
const mock = (bunTest as unknown as {
  mock: { module: (specifier: string, factory: () => unknown) => void };
}).mock;
const card = { ...createEmptyCard(), code: 100, name: 'Original', attack: 2000 };
const documents = [{ id: 'reopened', typeId: 'ygo.card-collection', source: { path: 'A.cdb' } }];
const commands: Array<{ id: string; command: unknown }> = [];
const queued: unknown[] = [];
const scriptTab = { id: 'script-tab', content: '-- unsaved buffer', scriptPath: 'c100.lua' };
const savedScripts: string[] = [];
let diskReads = 0;
let diskWrites = 0;
let scriptOwner: unknown[] = [];
mock.module('$lib/platform/appRuntime', () => ({
  documentRuntime: {
    snapshot: { documents },
    query: async (id: string) => { expect(id).toBe('reopened'); return card; },
    execute: async (id: string, command: unknown) => { commands.push({ id, command }); return { changed: true }; },
    getDocument: () => ({ revision: 7 }),
  },
}));
mock.module('$lib/stores/tabs', () => ({ recordUndoLabel() {} }));
mock.module('$lib/stores/search', () => ({ refreshCachedSearchForTab: async () => true }));
mock.module('$lib/stores/scriptEditor.svelte', () => ({
  getOpenScriptTab: (...args: unknown[]) => { scriptOwner = args; return scriptTab; },
  getScriptTabsForCdb: () => [scriptTab],
  updateScriptTabContent: (id: string, content: string) => {
    expect(id).toBe(scriptTab.id);
    scriptTab.content = content;
  },
  saveScriptTab: async (id: string) => { savedScripts.push(id); return true; },
}));
mock.module('$lib/native/assetApi', () => ({
  pathExists: async () => true,
  readTextFile: async () => { diskReads++; return '-- disk'; },
  writeTextFile: async () => { diskWrites++; },
}));
mock.module('./workspaceMetadataState.svelte', () => ({
  getCardImageDocumentForPath: async () => null, setCardImageDocumentForPath: async () => {},
}));
mock.module('./aiProposalApplication.svelte', () => ({
  queueAiCardDraftPatch: (input: unknown) => { queued.push(input); },
}));
const { createAiPatchApplier } = await import('./aiProposalExecution');
const apply = createAiPatchApplier({ confirmConflict: async () => true, undoLabel: () => 'AI' });

test('persisted card proposals resolve reopened documents by path and retain guarded writes', async () => {
  commands.length = 0;
  const patch: WorkspaceAiPatch = {
    id: 'patch', kind: 'card', documentId: 'old-id', cdbPath: 'A.cdb', cardCode: 100,
    before: { ...card, attack: 1000 }, patch: { name: 'Proposed' },
    after: { ...card, name: 'Proposed', attack: 1000 },
  };
  await apply(patch);
  expect(commands).toEqual([{
    id: 'reopened',
    command: { kind: 'upsert', cards: [{ ...card, name: 'Proposed' }], expectedCards: [card] },
  }]);
  expect(queued).toEqual([{
    id: 'patch', workspaceId: 'reopened', cardCode: 100, revision: 7,
    patch: { ...card, name: 'Proposed' },
  }]);
});

test('a closed workspace never falls back to the currently open CDB', async () => {
  const count = commands.length;
  await expect(apply({
    id: 'closed', kind: 'card', documentId: 'reopened', cdbPath: 'closed.cdb',
    cardCode: 100, before: card, patch: { name: 'Wrong target' }, after: card,
  })).rejects.toThrow('Workspace is no longer open');
  expect(commands.length).toBe(count);
});

test('script proposals check and save the live buffer in the resolved workspace', async () => {
  await apply({
    id: 'script', kind: 'script', documentId: 'old-id', cdbPath: 'A.cdb',
    cardCode: 100, path: 'c100.lua', content: '-- proposed',
    baseline: await createScriptBaseline(scriptTab.content),
  });
  expect(scriptOwner).toEqual(['A.cdb', 100, 'reopened']);
  expect(scriptTab.content).toBe('-- proposed');
  expect(savedScripts).toEqual(['script-tab']);
  expect(diskReads).toBe(0);
  expect(diskWrites).toBe(0);
});
