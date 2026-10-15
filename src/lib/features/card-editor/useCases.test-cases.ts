import * as bunTest from 'bun:test';
import { writable } from 'svelte/store';
import { createEmptyCard } from '$lib/domain/card/draft';

const { test, expect } = bunTest;
const mock = (bunTest as unknown as {
  mock: { module: (specifier: string, factory: () => unknown) => void };
}).mock;
const activeId = writable<string | null>('A');
let confirmed = true;
let deleted: number[] = [];
let replacement: unknown[] = [];
let modified = false;
mock.module('$lib/infrastructure/tauri', () => ({
  tauriBridge: { ask: async () => confirmed }, invokeCommand: async () => undefined,
}));
mock.module('$lib/stores/db', () => ({
  activeTabId: activeId,
  deleteCardsInTab: async (_id: string, ids: number[]) => { deleted = ids; return true; },
  getCardByIdInTab: async () => undefined,
  modifyCardsInTab: async () => { modified = true; return true; },
  replaceCardIdInTab: async (...args: unknown[]) => { replacement = args; return true; },
  refreshSearchAfterMutation: async (_id: string, search: () => Promise<boolean>) => search(),
}));
mock.module('$lib/stores/appSettings.svelte', () => ({ appSettingsState: { values: {} } }));
mock.module('$lib/stores/editor.svelte', () => ({
  getAllCardsMap: () => new Map(), setSingleSelectedCard() {}, updateVisibleCards() {},
}));
mock.module('$lib/stores/toast.svelte', () => ({ showToast() {} }));
mock.module('$lib/services/cardScriptService', () => ({
  ensureCardScriptFile() {}, getExistingCardScriptInfo() {}, openCardScriptWorkspace() {}, openScriptWithDefaultApp() {},
}));
mock.module('$lib/modules/card/workbench/surfaceState.svelte', () => ({ activateCardSurface() {} }));
const { deleteDraftCardFlow, saveDraftCardFlow } = await import('./useCases');

test('the editor delete action removes the entire selected range in one operation', async () => {
  let resets = 0;
  deleted = [];
  await deleteDraftCardFlow({
    tabId: 'A', originalCardCode: 1, selectedCardIds: [1, 2, 3, 2], t: (key) => key,
    resetDraftCard: () => { resets += 1; }, clearSelection() {}, handleSearch: async () => true,
  });
  expect(deleted).toEqual([1, 2, 3]);
  expect(resets).toBe(1);
});

test('cancelled deletion does not delete any selected cards', async () => {
  confirmed = false;
  deleted = [];
  try {
    await deleteDraftCardFlow({
      tabId: 'A', originalCardCode: 1, selectedCardIds: [1, 2], t: (key) => key,
      resetDraftCard() {}, clearSelection() {}, handleSearch: async () => true,
    });
    expect(deleted).toHaveLength(0);
  } finally { confirmed = true; }
});

for (const removeOriginal of [true, false]) {
  test(`changing a password routes through the asset-aware command (removeOriginal=${removeOriginal})`, async () => {
    const card = createEmptyCard();
    card.code = 200;
    modified = false;
    replacement = [];
    expect(await saveDraftCardFlow({
      tabId: 'A', draftCard: card, originalCardCode: 100, removeOriginal, t: (key) => key,
      setDraftCard() {}, setOriginalCardCode() {}, setLastSyncedSelectedId() {}, setLastLoadedCardSnapshot() {},
      handleSearch: async () => true, refreshDraftImage: async () => {},
    })).toBe(true);
    expect(replacement[2]).toBe(100);
    expect(replacement[4]).toBe(removeOriginal);
    expect(modified).toBe(false);
  });
}
