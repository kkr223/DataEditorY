import * as bunTest from 'bun:test';
import { createCardSnapshot, createEmptyCard } from '$lib/domain/card/draft';

const { describe, expect, test } = bunTest;
const mock = (bunTest as unknown as {
  mock: { module: (specifier: string, factory: () => unknown) => void };
}).mock;

mock.module('$lib/stores/toast.svelte', () => ({
  showToast: () => undefined,
}));

const { createCardEditorLifecycleController } = await import('./lifecycle');

function createSaveController() {
  const card = createEmptyCard();
  card.code = 1000;
  card.name = 'Edited card';
  let lastLoadedCardSnapshot = '';

  const controller = createCardEditorLifecycleController({
    getCoverImageSrc: () => null,
    getDraftCard: () => card,
    setDraftCard: () => undefined,
    getOriginalCardCode: () => card.code,
    setOriginalCardCode: () => undefined,
    getLastLoadedCardSnapshot: () => lastLoadedCardSnapshot,
    setLastLoadedCardSnapshot: (snapshot) => {
      lastLoadedCardSnapshot = snapshot;
    },
    setLastSyncedSelectedId: () => undefined,
    setSetcodeHexAt: () => undefined,
    setTrackedDraftSnapshot: () => undefined,
    setDraftUndoHistory: () => undefined,
    mutateSuspendDraftUndoTracking: () => undefined,
    nextImageRequestToken: () => 0,
    isLatestImageRequestToken: () => true,
    getImageSrc: () => '',
    setImageSrc: () => undefined,
    getActiveCdbPath: () => 'A.cdb',
    isDbLoaded: () => true,
    t: (key) => key,
  });

  return {
    controller,
    markDraftCommitted: () => {
      lastLoadedCardSnapshot = createCardSnapshot(card);
    },
  };
}

describe('card editor workspace save', () => {
  test('uses the captured save target after an asynchronous draft commit', async () => {
    const { controller, markDraftCommitted } = createSaveController();
    let activeTarget = 'tab-a';
    const capturedTarget = activeTarget;
    let savedTarget = '';

    const saved = await controller.handleSaveWorkspace(async () => {
      activeTarget = 'tab-b';
      markDraftCommitted();
      return true;
    }, async () => {
      savedTarget = capturedTarget;
      return true;
    });

    expect(saved).toBe(true);
    expect(activeTarget).toBe('tab-b');
    expect(savedTarget).toBe('tab-a');
  });

  test('does not save when the dirty draft commit fails', async () => {
    const { controller } = createSaveController();
    let saveCalls = 0;

    const saved = await controller.handleSaveWorkspace(
      async () => false,
      async () => {
        saveCalls += 1;
        return true;
      },
    );

    expect(saved).toBe(false);
    expect(saveCalls).toBe(0);
  });
});
