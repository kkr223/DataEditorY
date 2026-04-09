import { DEFAULT_SEARCH_FILTERS } from '$lib/types';
import type { CardDataEntry, SearchFilterState } from '$lib/types';
import type { ScriptGenerationStage } from '$lib/services/scriptGenerationStages';
import { cloneEditableCard, createEmptyCard } from '$lib/utils/card';
import { createCardSnapshot } from '$lib/domain/card/draft';
import { ATTRIBUTE_MAP, RACE_MAP, SUBTYPE_MAP, TYPE_MAP } from '$lib/domain/card/taxonomy';

export const CARD_LIST_PAGE_SIZE = 50;

export type CardScriptGenerationState = {
  isGenerating: boolean;
  stage: ScriptGenerationStage | '';
  abortController: AbortController | null;
};

export function buildEmptyDraftState(defaultCoverSrc: string) {
  return {
    lastSyncedSelectedId: null as number | null,
    lastLoadedCardSnapshot: '',
    originalCardCode: null as number | null,
    draftCard: createEmptyCard(),
    imageSrc: defaultCoverSrc,
  };
}

export function buildLoadedDraftState(card: CardDataEntry) {
  return {
    lastSyncedSelectedId: card.code,
    lastLoadedCardSnapshot: createCardSnapshot(card),
    originalCardCode: card.code,
    draftCard: cloneEditableCard(card),
  };
}

export function createCardScriptGenerationState(): CardScriptGenerationState {
  return {
    isGenerating: false,
    stage: '',
    abortController: null,
  };
}

export function createCardScriptGenerationController(state: CardScriptGenerationState) {
  return {
    setIsGenerating(value: boolean) {
      state.isGenerating = value;
    },
    setStage(value: ScriptGenerationStage | '') {
      state.stage = value;
    },
    setAbortController(value: AbortController | null) {
      state.abortController = value;
    },
    cancel() {
      state.abortController?.abort();
    },
    reset() {
      state.isGenerating = false;
      state.stage = '';
      state.abortController = null;
    },
  };
}

export function createCardImageInteractionController(input: {
  clickDelayMs?: number;
  onPickImage: () => void | Promise<void>;
  hasImageSrc: () => boolean;
  hasCardImageCapability: () => boolean;
  setPreviewOpen: (value: boolean) => void;
  setDrawerOpen: (value: boolean) => void;
}) {
  let clickTimer: ReturnType<typeof setTimeout> | null = null;

  function clearPendingClick() {
    if (clickTimer) {
      clearTimeout(clickTimer);
      clickTimer = null;
    }
  }

  return {
    clearPendingClick,
    dispose() {
      clearPendingClick();
    },
    hasPendingClick() {
      return clickTimer !== null;
    },
    handleImageClick() {
      clearPendingClick();
      clickTimer = setTimeout(() => {
        clickTimer = null;
        void input.onPickImage();
      }, input.clickDelayMs ?? 220);
    },
    handleImageDoubleClick(event: Pick<MouseEvent, 'preventDefault'>) {
      event.preventDefault();
      clearPendingClick();
      if (!input.hasImageSrc()) {
        return false;
      }
      input.setPreviewOpen(true);
      return true;
    },
    closePreview() {
      input.setPreviewOpen(false);
    },
    openDrawer() {
      if (!input.hasCardImageCapability()) {
        return false;
      }
      input.setDrawerOpen(true);
      return true;
    },
    closeDrawer() {
      input.setDrawerOpen(false);
    },
  };
}

export function isDraftDirty(input: {
  draftCard: CardDataEntry;
  originalCardCode: number | null;
  lastLoadedCardSnapshot: string;
}) {
  const currentSnapshot = createCardSnapshot(input.draftCard);
  if (input.originalCardCode === null) {
    return currentSnapshot !== createCardSnapshot(createEmptyCard());
  }

  return currentSnapshot !== input.lastLoadedCardSnapshot;
}

export function createInitialParseManuscript(draftCard: CardDataEntry) {
  if (!draftCard.name && !draftCard.desc) {
    return '';
  }

  return `${draftCard.name ?? ''}\n${draftCard.desc ?? ''}`.trim();
}

function findKeyByExactValue(source: Record<string, number>, value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return '';
  }

  return Object.entries(source).find(([, bit]) => bit === value)?.[0] ?? '';
}

function resolveSubtype(type: number) {
  if ((type & TYPE_MAP.monster) !== 0) {
    const monsterSubtypeOrder = [
      'link',
      'xyz',
      'synchro',
      'fusion',
      'ritual',
      'pendulum',
      'toon',
      'flip',
      'tuner',
      'gemini',
      'union',
      'spirit',
      'spssummon',
      'token',
      'normal',
      'effect',
    ] as const;

    return monsterSubtypeOrder.find((key) => (type & SUBTYPE_MAP[key]) !== 0) ?? '';
  }

  if ((type & TYPE_MAP.spell) !== 0) {
    const spellSubtypeOrder = [
      'quickplay',
      'continuous_spell',
      'equip',
      'field',
      'ritual_spell',
    ] as const;

    return spellSubtypeOrder.find((key) => (type & SUBTYPE_MAP[key]) !== 0) ?? 'normal';
  }

  if ((type & TYPE_MAP.trap) !== 0) {
    const trapSubtypeOrder = [
      'continuous_trap',
      'counter',
    ] as const;

    return trapSubtypeOrder.find((key) => (type & SUBTYPE_MAP[key]) !== 0) ?? 'normal';
  }

  return '';
}

export function buildSearchFiltersFromDraft(draftCard: CardDataEntry): SearchFilterState {
  const nextFilters: SearchFilterState = {
    ...DEFAULT_SEARCH_FILTERS,
  };

  if (draftCard.code > 0) {
    nextFilters.id = String(draftCard.code);
  }

  if (draftCard.name.trim()) {
    nextFilters.name = draftCard.name.trim();
  }

  if (draftCard.desc.trim()) {
    nextFilters.desc = draftCard.desc.trim();
  }

  if ((draftCard.type & TYPE_MAP.monster) !== 0) {
    nextFilters.type = 'monster';
  } else if ((draftCard.type & TYPE_MAP.spell) !== 0) {
    nextFilters.type = 'spell';
  } else if ((draftCard.type & TYPE_MAP.trap) !== 0) {
    nextFilters.type = 'trap';
  }

  const subtype = resolveSubtype(draftCard.type);
  if (subtype) {
    nextFilters.subtype = subtype;
  }

  if (draftCard.attack !== 0) {
    nextFilters.atkMin = String(draftCard.attack);
    nextFilters.atkMax = String(draftCard.attack);
  }

  if (draftCard.defense !== 0) {
    nextFilters.defMin = String(draftCard.defense);
    nextFilters.defMax = String(draftCard.defense);
  }

  const attribute = findKeyByExactValue(ATTRIBUTE_MAP, draftCard.attribute);
  if (attribute) {
    nextFilters.attribute = attribute;
  }

  const race = findKeyByExactValue(RACE_MAP, draftCard.race);
  if (race) {
    nextFilters.race = race;
  }

  const setcodes = Array.isArray(draftCard.setcode) ? draftCard.setcode : [];
  for (let index = 0; index < 4; index += 1) {
    const rawValue = Number(setcodes[index] ?? 0);
    if (!Number.isInteger(rawValue) || rawValue <= 0) {
      continue;
    }

    const normalizedSetcode = rawValue.toString(16);
    if (index === 0) nextFilters.setcode1 = normalizedSetcode;
    else if (index === 1) nextFilters.setcode2 = normalizedSetcode;
    else if (index === 2) nextFilters.setcode3 = normalizedSetcode;
    else nextFilters.setcode4 = normalizedSetcode;
  }

  return nextFilters;
}

export function shouldIgnoreArrowNavigation(input: {
  event: KeyboardEvent;
  isKeyboardNavigating: boolean;
  isParseModalOpen: boolean;
  isCardImageDrawerOpen: boolean;
  isImagePreviewOpen: boolean;
  isEditableTarget: (target: EventTarget | null) => boolean;
}) {
  return (
    input.event.defaultPrevented
    || input.event.repeat
    || input.event.isComposing
    || input.event.ctrlKey
    || input.event.metaKey
    || input.event.altKey
    || input.event.shiftKey
    || input.isEditableTarget(input.event.target)
    || input.isKeyboardNavigating
    || input.isParseModalOpen
    || input.isCardImageDrawerOpen
    || input.isImagePreviewOpen
  );
}

export function resolveSelectionNavigationTarget(input: {
  cards: CardDataEntry[];
  selectedId: number | null;
  delta: number;
}) {
  if (input.cards.length === 0) {
    return null;
  }

  const currentIndex = input.cards.findIndex((card) => card.code === input.selectedId);
  const fallbackIndex = input.delta > 0 ? 0 : input.cards.length - 1;
  const baseIndex = currentIndex === -1 ? fallbackIndex : currentIndex;
  const nextIndex = Math.max(0, Math.min(input.cards.length - 1, baseIndex + input.delta));
  if (nextIndex === currentIndex) {
    return null;
  }

  return input.cards[nextIndex]?.code ?? null;
}

export function resolvePageNavigationTarget(input: {
  totalCards: number;
  currentPage: number;
  delta: number;
  pageSize?: number;
}) {
  if (input.totalCards <= 0) {
    return null;
  }

  const totalPages = Math.max(1, Math.ceil(input.totalCards / (input.pageSize ?? CARD_LIST_PAGE_SIZE)));
  const nextPage = Math.max(1, Math.min(totalPages, input.currentPage + input.delta));
  if (nextPage === input.currentPage) {
    return null;
  }

  return nextPage;
}

export async function handleCardEditorKeydown(
  event: KeyboardEvent,
  input: {
    isDbLoaded: boolean;
    isKeyboardNavigating: boolean;
    isParseModalOpen: boolean;
    isCardImageDrawerOpen: boolean;
    isImagePreviewOpen: boolean;
    isEditableTarget: (target: EventTarget | null) => boolean;
    confirmDiscardDraft: () => Promise<boolean>;
    onModify: () => Promise<void>;
    getSelectionTarget: (delta: number) => number | null;
    selectCard: (cardCode: number) => void;
    getPageTarget: (delta: number) => number | null;
    setCurrentPage: (page: number) => void;
    runSearch: () => Promise<void>;
    setKeyboardNavigating: (value: boolean) => void;
  },
) {
  if (event.defaultPrevented || event.repeat || event.isComposing || !input.isDbLoaded) {
    return;
  }

  const isPrimary = event.ctrlKey || event.metaKey;
  if (
    isPrimary
    && !event.altKey
    && !event.shiftKey
    && event.key === 'Enter'
    && !input.isKeyboardNavigating
    && !input.isParseModalOpen
    && !input.isCardImageDrawerOpen
    && !input.isImagePreviewOpen
  ) {
    event.preventDefault();
    input.setKeyboardNavigating(true);
    try {
      await input.onModify();
    } finally {
      input.setKeyboardNavigating(false);
    }
    return;
  }

  if (shouldIgnoreArrowNavigation({
    event,
    isKeyboardNavigating: input.isKeyboardNavigating,
    isParseModalOpen: input.isParseModalOpen,
    isCardImageDrawerOpen: input.isCardImageDrawerOpen,
    isImagePreviewOpen: input.isImagePreviewOpen,
    isEditableTarget: input.isEditableTarget,
  })) {
    return;
  }

  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
    return;
  }

  event.preventDefault();
  input.setKeyboardNavigating(true);

  try {
    if (event.key === 'ArrowUp') {
      const nextCardCode = input.getSelectionTarget(-1);
      if (nextCardCode === null) {
        return;
      }
      if (!(await input.confirmDiscardDraft())) {
        return;
      }
      input.selectCard(nextCardCode);
      return;
    }

    if (event.key === 'ArrowDown') {
      const nextCardCode = input.getSelectionTarget(1);
      if (nextCardCode === null) {
        return;
      }
      if (!(await input.confirmDiscardDraft())) {
        return;
      }
      input.selectCard(nextCardCode);
      return;
    }

    if (event.key === 'ArrowLeft') {
      const nextPage = input.getPageTarget(-1);
      if (nextPage === null) {
        return;
      }
      if (!(await input.confirmDiscardDraft())) {
        return;
      }
      input.setCurrentPage(nextPage);
      await input.runSearch();
      return;
    }

    if (event.key === 'ArrowRight') {
      const nextPage = input.getPageTarget(1);
      if (nextPage === null) {
        return;
      }
      if (!(await input.confirmDiscardDraft())) {
        return;
      }
      input.setCurrentPage(nextPage);
      await input.runSearch();
    }
  } finally {
    input.setKeyboardNavigating(false);
  }
}

export function handleParseModalBackdropDismiss(
  event: KeyboardEvent,
  close: () => void,
) {
  if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    close();
  }
}
