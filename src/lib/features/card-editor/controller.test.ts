import { describe, expect, test } from 'bun:test';
import type { CardDataEntry } from '$lib/types';
import {
  buildEmptyDraftState,
  buildLoadedDraftState,
  createCardImageInteractionController,
  createInitialParseManuscript,
  createCardScriptGenerationController,
  createCardScriptGenerationState,
  isDraftDirty,
  resolvePageNavigationTarget,
  resolveSelectionNavigationTarget,
} from '$lib/features/card-editor/controller';
import { createCardSnapshot } from '$lib/domain/card/draft';

function createCard(overrides: Partial<CardDataEntry> = {}): CardDataEntry {
  return {
    code: 1000,
    alias: 0,
    setcode: [],
    type: 0,
    level: 4,
    race: 0,
    attribute: 0,
    attack: 1500,
    defense: 1200,
    lscale: 0,
    rscale: 0,
    linkMarker: 0,
    ot: 0,
    ruleCode: 0,
    category: 0,
    name: 'Test Card',
    desc: 'Test description',
    strings: Array.from({ length: 16 }, () => ''),
    ...overrides,
  };
}

describe('card editor controller helpers', () => {
  test('builds a fresh draft state with the provided cover image', () => {
    const state = buildEmptyDraftState('/resources/custom-cover.jpg');

    expect(state.originalCardCode).toBeNull();
    expect(state.lastLoadedCardSnapshot).toBe('');
    expect(state.imageSrc).toBe('/resources/custom-cover.jpg');
  });

  test('builds a loaded draft state from an existing card', () => {
    const card = createCard({ code: 1234 });
    const state = buildLoadedDraftState(card);

    expect(state.originalCardCode).toBe(1234);
    expect(state.lastSyncedSelectedId).toBe(1234);
    expect(state.lastLoadedCardSnapshot).toBe(createCardSnapshot(card));
    expect(state.draftCard).not.toBe(card);
    expect(state.draftCard.code).toBe(1234);
  });

  test('detects dirty state for edited existing drafts', () => {
    const card = createCard();

    expect(isDraftDirty({
      draftCard: card,
      originalCardCode: card.code,
      lastLoadedCardSnapshot: createCardSnapshot(card),
    })).toBe(false);

    expect(isDraftDirty({
      draftCard: { ...card, attack: 2000 },
      originalCardCode: card.code,
      lastLoadedCardSnapshot: createCardSnapshot(card),
    })).toBe(true);
  });

  test('builds an initial parse manuscript from name and description', () => {
    expect(createInitialParseManuscript(createCard())).toBe('Test Card\nTest description');
    expect(createInitialParseManuscript(createCard({ name: '', desc: '' }))).toBe('');
  });

  test('resolves selection navigation targets from the current list', () => {
    const cards = [createCard({ code: 1 }), createCard({ code: 2 }), createCard({ code: 3 })];

    expect(resolveSelectionNavigationTarget({
      cards,
      selectedId: 2,
      delta: 1,
    })).toBe(3);

    expect(resolveSelectionNavigationTarget({
      cards,
      selectedId: null,
      delta: 1,
    })).toBe(2);

    expect(resolveSelectionNavigationTarget({
      cards,
      selectedId: 1,
      delta: -1,
    })).toBeNull();
  });

  test('resolves page navigation boundaries', () => {
    expect(resolvePageNavigationTarget({
      totalCards: 120,
      currentPage: 1,
      delta: 1,
      pageSize: 50,
    })).toBe(2);

    expect(resolvePageNavigationTarget({
      totalCards: 120,
      currentPage: 3,
      delta: 1,
      pageSize: 50,
    })).toBeNull();
  });

  test('tracks script generation state through a controller boundary', () => {
    const state = createCardScriptGenerationState();
    const controller = createCardScriptGenerationController(state);
    const abortController = new AbortController();

    controller.setIsGenerating(true);
    controller.setStage('requesting_model');
    controller.setAbortController(abortController);

    expect(state.isGenerating).toBe(true);
    expect(state.stage).toBe('requesting_model');
    expect(state.abortController).toBe(abortController);

    controller.cancel();
    expect(abortController.signal.aborted).toBe(true);

    controller.reset();
    expect(state.isGenerating).toBe(false);
    expect(state.stage).toBe('');
    expect(state.abortController).toBeNull();
  });

  test('coordinates image click, preview, and drawer state', async () => {
    const imageState = {
      previewOpen: false,
      drawerOpen: false,
      picked: 0,
    };

    const controller = createCardImageInteractionController({
      clickDelayMs: 5,
      onPickImage: () => {
        imageState.picked += 1;
      },
      hasImageSrc: () => true,
      hasCardImageCapability: () => true,
      setPreviewOpen: (value) => {
        imageState.previewOpen = value;
      },
      setDrawerOpen: (value) => {
        imageState.drawerOpen = value;
      },
    });

    controller.handleImageClick();
    expect(controller.hasPendingClick()).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(imageState.picked).toBe(1);
    expect(controller.hasPendingClick()).toBe(false);

    controller.handleImageDoubleClick({
      preventDefault() {},
    });
    expect(imageState.previewOpen).toBe(true);

    controller.closePreview();
    expect(imageState.previewOpen).toBe(false);

    expect(controller.openDrawer()).toBe(true);
    expect(imageState.drawerOpen).toBe(true);

    controller.closeDrawer();
    expect(imageState.drawerOpen).toBe(false);
  });
});
