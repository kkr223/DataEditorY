import * as bunTest from 'bun:test';
import { writable } from 'svelte/store';
import { cloneEditableCard, createCardSnapshot, createEmptyCard } from '$lib/domain/card/draft';
import type { CardDataEntry } from '$lib/types';

const { test, expect } = bunTest;
const mock = (bunTest as unknown as {
  mock: { module: (specifier: string, factory: () => unknown) => void };
}).mock;
const activeId = writable<string | null>('A');
let confirmed = true;
let deleted: number[] = [];
let replacement: unknown[] = [];
let modified = false;
let targetCard: CardDataEntry | undefined;
let queryError: Error | undefined;
let questions: string[] = [];
let mutate = async () => true;
mock.module('$lib/infrastructure/tauri', () => ({
  tauriBridge: { ask: async (question: string) => { questions.push(question); return confirmed; } }, invokeCommand: async () => undefined,
}));
mock.module('$lib/stores/db', () => ({
  activeTabId: activeId,
  deleteCardsInTab: async (_id: string, ids: number[]) => { deleted = ids; return true; },
  queryCardByIdInTab: async () => { if (queryError) throw queryError; return targetCard; },
  modifyCardsInTab: async () => { modified = true; return mutate(); },
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
const { deleteDraftCardFlow, saveDraftCardFlow, modifyDraftCardFlow, saveAsDraftCardFlow } = await import('./useCases');

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

test('selected cards can be deleted without an existing single-card draft', async () => {
  deleted = [];
  let confirmCount = '';
  await deleteDraftCardFlow({
    tabId: 'A', originalCardCode: null, selectedCardIds: [10, 20, 30],
    t: (key, options) => {
      if (key === 'editor.delete_selected_confirm') confirmCount = String((options?.values as { count: string }).count);
      return key;
    },
    resetDraftCard() {}, clearSelection() {}, handleSearch: async () => true,
  });
  expect(deleted).toEqual([10, 20, 30]);
  expect(confirmCount).toBe('3');
});

for (const removeOriginal of [true, false]) {
  test(`changing a password routes through the asset-aware command (removeOriginal=${removeOriginal})`, async () => {
    const card = createEmptyCard();
    card.code = 200;
    modified = false;
    replacement = [];
    expect(await saveDraftCardFlow({
      tabId: 'A', draftCard: card, originalCardCode: 100, removeOriginal, t: (key) => key,
      getDraftCard: () => card, canUpdateDraft: () => true,
      setDraftCard() {}, setOriginalCardCode() {}, setLastSyncedSelectedId() {}, setLastLoadedCardSnapshot() {},
      handleSearch: async () => true, refreshDraftImage: async () => {},
    })).toBe(true);
    expect(replacement[2]).toBe(100);
    expect(replacement[4]).toBe(removeOriginal);
    expect(modified).toBe(false);
  });
}

test('changing an existing ID requires target approval before moving or copying', async () => {
  targetCard = { ...createEmptyCard(), code: 200, name: 'Existing target' };
  questions = [];
  confirmed = false;
  let writes = 0;
  try {
    const result = await modifyDraftCardFlow({
      tabId: 'A', draftCard: { ...createEmptyCard(), code: 200 }, originalCardCode: 100,
      isEditingExisting: true, t: key => key,
      saveDraftCard: async () => { writes++; return true; },
    });
    expect(result).toBe(false);
    expect(writes).toBe(0);
    expect(questions).toEqual(['editor.overwrite_target_confirm']);
  } finally { confirmed = true; targetCard = undefined; }
});

test('approved overwrite forwards the reviewed target as a write precondition', async () => {
  targetCard = { ...createEmptyCard(), code: 200, name: 'Reviewed target' };
  questions = [];
  let args: unknown[] = [];
  try {
    expect(await modifyDraftCardFlow({
      tabId: 'A', draftCard: { ...createEmptyCard(), code: 200 }, originalCardCode: 100,
      isEditingExisting: true, t: key => key,
      saveDraftCard: async (...input) => { args = input; return true; },
    })).toBe(true);
    expect(questions).toEqual(['editor.overwrite_target_confirm', 'editor.replace_original_confirm']);
    expect(args).toEqual([200, true, targetCard]);
  } finally { targetCard = undefined; }
});

for (const flow of [modifyDraftCardFlow, saveAsDraftCardFlow]) {
  test(`${flow.name} does not treat a failed target read as a missing card`, async () => {
    queryError = new Error('query unavailable');
    let writes = 0;
    try {
      expect(await flow({
        tabId: 'A', draftCard: { ...createEmptyCard(), code: 200 }, originalCardCode: 100,
        isEditingExisting: true, t: key => key,
        saveDraftCard: async () => { writes++; return true; },
      })).toBe(false);
      expect(writes).toBe(0);
    } finally { queryError = undefined; }
  });
}

function savingDraft() {
  const submitted = { ...createEmptyCard(), code: 100, name: 'Submitted' };
  let draft = cloneEditableCard(submitted);
  let baseline = '';
  let originalCode: number | null = 100;
  let current = true;
  const input: Parameters<typeof saveDraftCardFlow>[0] = {
    tabId: 'A', draftCard: submitted, originalCardCode: 100, t: key => key,
    getDraftCard: () => draft, canUpdateDraft: () => current,
    setDraftCard: card => { draft = card; },
    setOriginalCardCode: code => { originalCode = code; },
    setLastSyncedSelectedId() {},
    setLastLoadedCardSnapshot: snapshot => { baseline = snapshot; },
    handleSearch: async () => true, refreshDraftImage: async () => {},
  };
  return {
    input, submitted, getDraft: () => draft, getBaseline: () => baseline,
    getOriginalCode: () => originalCode,
    edit: (name: string) => { draft.name = name; },
    leave: () => { current = false; },
  };
}

for (const phase of ['write', 'refresh'] as const) {
  test(`edits during ${phase} survive and prevent navigation or CDB save`, async () => {
    const draft = savingDraft();
    let resume!: () => void;
    let started!: () => void;
    const waiting = new Promise<void>(resolve => { resume = resolve; });
    const entered = new Promise<void>(resolve => { started = resolve; });
    const pause = async () => { started(); await waiting; return true; };
    if (phase === 'write') mutate = pause;
    else draft.input.handleSearch = pause;
    try {
      const saving = saveDraftCardFlow(draft.input);
      await entered;
      draft.edit('New input');
      resume();
      expect(await saving).toBe(false);
      expect(draft.getDraft().name).toBe('New input');
      expect(draft.getBaseline()).toBe(createCardSnapshot(draft.submitted));
      expect(draft.getBaseline()).not.toBe(createCardSnapshot(draft.getDraft()));
    } finally { resume(); mutate = async () => true; }
  });
}

test('late save completion cannot replace another draft context', async () => {
  const draft = savingDraft();
  mutate = async () => { draft.leave(); draft.edit('Other workspace'); return true; };
  try {
    expect(await saveDraftCardFlow(draft.input)).toBe(false);
    expect(draft.getDraft().name).toBe('Other workspace');
    expect(draft.getBaseline()).toBe('');
  } finally { mutate = async () => true; }
});

test('a successful commit acknowledges the submitted version', async () => {
  const draft = savingDraft();
  expect(await saveDraftCardFlow(draft.input)).toBe(true);
  expect(draft.getBaseline()).toBe(createCardSnapshot(draft.getDraft()));
  expect(draft.getOriginalCode()).toBe(100);
});
