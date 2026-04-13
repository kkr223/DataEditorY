import { describe, expect, test } from 'bun:test';
import type { CardDataEntry } from '$lib/types';
import {
  buildEmptyDraftState,
  buildSearchFiltersFromDraft,
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
import { LINK_MARKER_NAME_TO_BIT, SUBTYPE_MAP, TYPE_MAP } from '$lib/domain/card/taxonomy';
import { setPackedLevel } from '$lib/utils/card';

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

  test('builds draft search filters including zero stats and advanced rule fields', () => {
    const filters = buildSearchFiltersFromDraft(createCard({
      type: TYPE_MAP.monster | SUBTYPE_MAP.link | SUBTYPE_MAP.pendulum,
      attack: 0,
      defense: 0,
      level: 8,
      lscale: 2,
      rscale: 2,
      linkMarker: LINK_MARKER_NAME_TO_BIT.up | LINK_MARKER_NAME_TO_BIT.right,
      ot: 3,
    }));

    expect(filters.name).toBe('Test Card');
    expect(filters.atkMin).toBe('');
    expect(filters.atkMax).toBe('');
    expect(filters.defMin).toBe('');
    expect(filters.defMax).toBe('');
    expect(filters.type).toBe('monster');
    expect(filters.rule).toContain('ot = 3');
    expect(filters.rule).toContain('level = 8');
    expect(filters.rule).toContain('scale = 2');
    expect(filters.rule).toContain('rscale = 2');
    expect(filters.rule).toContain('linkmarker contains up');
    expect(filters.rule).toContain('linkmarker contains right');
  });

  test('infers monster search when dex search uses atk without an explicit main type', () => {
    const filters = buildSearchFiltersFromDraft(createCard({
      type: 0,
      attack: 1500,
      defense: 0,
      level: 0,
      attribute: 0,
      race: 0,
      linkMarker: 0,
      lscale: 0,
      rscale: 0,
      name: '',
      desc: '',
      code: 0,
    }));

    expect(filters.type).toBe('monster');
    expect(filters.atkMin).toBe('1500');
    expect(filters.atkMax).toBe('1500');
  });

  test('preserves DEX special atk/def values when searching from the draft editor', () => {
    const filters = buildSearchFiltersFromDraft(createCard({
      type: TYPE_MAP.monster,
      attack: -2,
      defense: -1,
      name: '',
      desc: '',
      code: 0,
    }));

    expect(filters.type).toBe('monster');
    expect(filters.atkMin).toBe('-2');
    expect(filters.atkMax).toBe('-2');
    expect(filters.defMin).toBe('-1');
    expect(filters.defMax).toBe('-1');
  });

  test('infers spell search when only quick-play is checked in the draft editor', () => {
    const filters = buildSearchFiltersFromDraft(createCard({
      type: SUBTYPE_MAP.quickplay,
      name: '',
      desc: '',
      code: 0,
      attack: 0,
      defense: 0,
      level: 0,
    }));

    expect(filters.type).toBe('spell');
    expect(filters.subtype).toBe('quickplay');
    expect(filters.rule).toContain('type contains spell');
    expect(filters.rule).toContain('type contains quickplay');
  });

  test('builds DEX-style bitwise type rules for multiple checked monster kinds', () => {
    const filters = buildSearchFiltersFromDraft(createCard({
      type: TYPE_MAP.monster | SUBTYPE_MAP.effect | SUBTYPE_MAP.tuner,
      name: '',
      desc: '',
      code: 0,
      attack: 0,
      defense: 0,
      level: 0,
    }));

    expect(filters.rule).toContain('type contains monster');
    expect(filters.rule).toContain('type contains effect');
    expect(filters.rule).toContain('type contains tuner');
  });

  test('does not force normal subtype when only spell is checked in the draft editor', () => {
    const filters = buildSearchFiltersFromDraft(createCard({
      type: TYPE_MAP.spell,
      name: '',
      desc: '',
      code: 0,
      attack: 0,
      defense: 0,
      level: 0,
    }));

    expect(filters.type).toBe('spell');
    expect(filters.subtype).toBe('');
    expect(filters.rule).toContain('type contains spell');
  });

  test('does not infer spell when only continuous is checked in the draft editor', () => {
    const filters = buildSearchFiltersFromDraft(createCard({
      type: SUBTYPE_MAP.continuous_spell,
      name: '',
      desc: '',
      code: 0,
      attack: 0,
      defense: 0,
      level: 0,
    }));

    expect(filters.type).toBe('');
    expect(filters.subtype).toBe('');
    expect(filters.rule).toContain('type contains continuous_spell');
    expect(filters.rule.includes('type contains spell')).toBe(false);
    expect(filters.rule.includes('type contains trap')).toBe(false);
  });

  test('infers monster search when only link is checked in the draft editor', () => {
    const filters = buildSearchFiltersFromDraft(createCard({
      type: SUBTYPE_MAP.link,
      name: '',
      desc: '',
      code: 0,
      attack: 0,
      defense: 0,
      level: 0,
      linkMarker: 0,
      lscale: 0,
      rscale: 0,
    }));

    expect(filters.type).toBe('monster');
    expect(filters.subtype).toBe('link');
    expect(filters.rule).toContain('type contains monster');
    expect(filters.rule).toContain('type contains link');
  });

  test('infers monster search when only pendulum is checked in the draft editor', () => {
    const filters = buildSearchFiltersFromDraft(createCard({
      type: SUBTYPE_MAP.pendulum,
      name: '',
      desc: '',
      code: 0,
      attack: 0,
      defense: 0,
      level: 0,
      lscale: 0,
      rscale: 0,
    }));

    expect(filters.type).toBe('monster');
    expect(filters.subtype).toBe('pendulum');
    expect(filters.rule).toContain('type contains monster');
    expect(filters.rule).toContain('type contains pendulum');
  });

  test('uses the unpacked level when pendulum edits store a packed level value', () => {
    const filters = buildSearchFiltersFromDraft(createCard({
      type: SUBTYPE_MAP.pendulum,
      level: setPackedLevel(8, 2, 3),
      lscale: 2,
      rscale: 3,
      name: '',
      desc: '',
      code: 0,
      attack: 0,
      defense: 0,
    }));

    expect(filters.type).toBe('monster');
    expect(filters.subtype).toBe('pendulum');
    expect(filters.rule).toContain('level = 8');
    expect(filters.rule).toContain('scale = 2');
    expect(filters.rule).toContain('rscale = 3');
    expect(filters.rule.includes(`level = ${setPackedLevel(8, 2, 3)}`)).toBe(false);
  });

  test('ignores default zero scales when pendulum search only fills one side', () => {
    const filters = buildSearchFiltersFromDraft(createCard({
      type: SUBTYPE_MAP.pendulum,
      lscale: 4,
      rscale: 0,
      name: '',
      desc: '',
      code: 0,
      attack: 0,
      defense: 0,
      level: 0,
    }));

    expect(filters.type).toBe('monster');
    expect(filters.rule).toContain('type contains pendulum');
    expect(filters.rule).toContain('scale = 4');
    expect(filters.rule.includes('rscale = 0')).toBe(false);
  });

  test('treats -1 pendulum scales as exact zero searches and ignores untouched zero scales', () => {
    const filters = buildSearchFiltersFromDraft(createCard({
      type: SUBTYPE_MAP.pendulum,
      lscale: -1,
      rscale: 0,
      name: '',
      desc: '',
      code: 0,
      attack: 0,
      defense: 0,
      level: 0,
    }));

    expect(filters.type).toBe('monster');
    expect(filters.rule).toContain('scale = 0');
    expect(filters.rule.includes('rscale = 0')).toBe(false);
  });

  test('infers link and pendulum search signals from markers and scales even without explicit type bits', () => {
    const filters = buildSearchFiltersFromDraft(createCard({
      type: 0,
      level: setPackedLevel(0, 4, 4),
      lscale: 4,
      rscale: 4,
      linkMarker: LINK_MARKER_NAME_TO_BIT.up | LINK_MARKER_NAME_TO_BIT.right,
      name: '',
      desc: '',
      code: 0,
      attack: 0,
      defense: 0,
    }));

    expect(filters.type).toBe('monster');
    expect(filters.rule).toContain('type contains monster');
    expect(filters.rule).toContain('type contains pendulum');
    expect(filters.rule).toContain('type contains link');
    expect(filters.rule).toContain('scale = 4');
    expect(filters.rule).toContain('rscale = 4');
    expect(filters.rule).toContain('linkmarker contains up');
    expect(filters.rule).toContain('linkmarker contains right');
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
