import * as bunTest from 'bun:test';
import { get, writable } from 'svelte/store';
import { createEmptyCard } from '#lib/domain/card/draft.ts';
import type { CardDataEntry } from '#lib/types/index.ts';
import { createDefaultShortcutBindingMap, isShortcutEvent, normalizeShortcutBindingMap } from '#lib/features/shortcuts/registry.ts';

const { test, expect } = bunTest;
const { beforeEach, mock } = bunTest as unknown as {
  beforeEach: (callback: () => void) => void;
  mock: { module: (specifier: string, factory: () => unknown) => void };
};
const activeId = writable<string | null>('A');
const editor = { selectedId: 100 as number | null };
const cards = new Map<number, CardDataEntry>();
const reads: number[] = [];
const writes: unknown[][] = [];
const navigation: unknown[][] = [];
const toasts: string[] = [];
let commit = async () => true;
let query = async (code: number) => cards.get(code);
let write = async () => true;
let refresh = async () => true;
let draft: { originalCardCode: number; draftCard: CardDataEntry } | null = null;

mock.module('svelte-i18n', () => ({ _: writable((key: string) => key) }));
mock.module('#lib/stores/db.ts', () => ({
  activeTabId: activeId,
  queryCardByIdInTab: async (_tabId: string, code: number) => { reads.push(code); return query(code); },
  modifyCardsInTab: async (...args: unknown[]) => { writes.push(args); return write(); },
  refreshSearchAfterMutation: async () => refresh(),
}));
mock.module('#lib/stores/editor.svelte.ts', () => ({ editorState: editor, handleSearch: async () => true }));
mock.module('#lib/stores/toast.svelte.ts', () => ({ showToast: (message: string) => { toasts.push(message); } }));
mock.module('#lib/utils/errorLog.ts', () => ({ writeErrorLog: async () => {} }));
mock.module('#lib/modules/card/workbench/cardDraftWorkspaceState.svelte.ts', () => ({
  commitWorkspaceCardDraft: () => commit(), getWorkspaceCardDraft: () => draft,
}));
mock.module('#lib/features/card-editor/cardNavigation.ts', () => ({
  navigateToCard: async (...args: unknown[]) => { navigation.push(args); },
}));
const { handleCreateAlternateArtwork } = await import('./alternateArtwork');

beforeEach(() => {
  activeId.set('A');
  editor.selectedId = 100;
  cards.clear();
  cards.set(100, { ...createEmptyCard(), code: 100, alias: 50, ruleCode: 50, name: 'Source', desc: 'Effect', strings: ['hint'], setcode: [12, 34] });
  reads.length = writes.length = navigation.length = toasts.length = 0;
  commit = async () => true;
  query = async (code) => cards.get(code);
  write = async () => true;
  refresh = async () => true;
  draft = null;
});

test('default complex shortcut is available to existing saved shortcut maps', () => {
  expect(createDefaultShortcutBindingMap()['global.createAlternateArtwork']).toBe('Primary+Alt+Shift+A');
  expect(normalizeShortcutBindingMap({ 'global.newCard': 'Primary+K' })['global.createAlternateArtwork']).toBe('Primary+Alt+Shift+A');
  const event = { key: 'A', ctrlKey: true, metaKey: false, altKey: true, shiftKey: true } as KeyboardEvent;
  expect(isShortcutEvent('global.createAlternateArtwork', event, {})).toBe(true);
  expect(isShortcutEvent('global.createAlternateArtwork', { ...event, shiftKey: false }, {})).toBe(false);
});

for (const freeOffset of [1, 3, 10]) {
  test(`creates at the nearest free ID +${freeOffset} with only cloned card data`, async () => {
    const source = cards.get(100)!;
    for (let offset = 1; offset < freeOffset; offset++) cards.set(100 + offset, { ...source, code: 100 + offset });
    await handleCreateAlternateArtwork();
    expect(writes).toHaveLength(1);
    const created = (writes[0][1] as CardDataEntry[])[0];
    expect(created).toEqual({ ...source, code: 100 + freeOffset, alias: 100 });
    expect(created.strings).not.toBe(source.strings);
    expect(created.setcode).not.toBe(source.setcode);
    expect(source.alias).toBe(50);
    expect(writes[0]).toEqual(['A', [created], false, [null]]);
    expect(navigation).toEqual([['A', 100 + freeOffset, 'card']]);
  });
}

test('stops at +10 without overwriting when the whole range is occupied', async () => {
  for (let code = 101; code <= 110; code++) cards.set(code, { ...createEmptyCard(), code });
  await handleCreateAlternateArtwork();
  expect(reads).toEqual(Array.from({ length: 11 }, (_, index) => 100 + index));
  expect(writes).toHaveLength(0);
  expect(toasts).toContain('editor.alternate_artwork_no_slot');
});

test('keeps candidate IDs within the CDB encoder unsigned 32-bit range', async () => {
  const source = { ...cards.get(100)!, code: 0xffffffff - 1 };
  cards.clear();
  cards.set(source.code, source);
  editor.selectedId = source.code;
  await handleCreateAlternateArtwork();
  expect((writes[0][1] as CardDataEntry[])[0].code).toBe(0xffffffff);
  writes.length = 0;
  cards.set(0xffffffff, { ...source, code: 0xffffffff });
  await handleCreateAlternateArtwork();
  expect(writes).toHaveLength(0);
  expect(reads.every((code) => code <= 0xffffffff)).toBe(true);
});

test('uses the committed draft including a changed source ID', async () => {
  const edited = { ...cards.get(100)!, code: 200, name: 'Edited source' };
  draft = { originalCardCode: 100, draftCard: edited };
  commit = async () => { cards.delete(100); cards.set(200, edited); editor.selectedId = 200; return true; };
  await handleCreateAlternateArtwork();
  expect((writes[0][1] as CardDataEntry[])[0]).toEqual({ ...edited, code: 201, alias: 200 });
});

test('validation failure blocks creation', async () => {
  commit = async () => false;
  await handleCreateAlternateArtwork();
  expect(reads).toHaveLength(0);
  expect(writes).toHaveLength(0);
});

test('read errors abort instead of treating unreadable IDs as free', async () => {
  query = async (code) => { if (code === 101) throw new Error('read failed'); return cards.get(code); };
  await handleCreateAlternateArtwork();
  expect(writes).toHaveLength(0);
  expect(toasts).toContain('editor.alternate_artwork_failed');
});

test('failed guarded writes do not select the target and release the pending guard', async () => {
  write = async () => false;
  await handleCreateAlternateArtwork();
  expect(navigation).toHaveLength(0);
  expect(writes).toHaveLength(1);
  write = async () => true;
  await handleCreateAlternateArtwork();
  expect(navigation).toHaveLength(1);
});

test('switching workspace or active card during preflight cancels creation', async () => {
  query = async (code) => { activeId.set('B'); return cards.get(code); };
  await handleCreateAlternateArtwork();
  expect(get(activeId)).toBe('B');
  expect(writes).toHaveLength(0);
  activeId.set('A');
  query = async (code) => { editor.selectedId = 300; return cards.get(code); };
  await handleCreateAlternateArtwork();
  expect(writes).toHaveLength(0);
});

test('repeated actions during a pending commit create at most one card', async () => {
  let finish!: (value: boolean) => void;
  commit = () => new Promise<boolean>((resolve) => { finish = resolve; });
  const pending = handleCreateAlternateArtwork();
  await handleCreateAlternateArtwork();
  finish(true);
  await pending;
  expect(writes).toHaveLength(1);
});

test('switching workspace during refresh leaves the new workspace focused', async () => {
  refresh = async () => { activeId.set('B'); return true; };
  await handleCreateAlternateArtwork();
  expect(writes).toHaveLength(1);
  expect(navigation).toHaveLength(0);
});
