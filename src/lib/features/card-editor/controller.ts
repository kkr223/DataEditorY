import type { CardDataEntry } from '$lib/types';
import type { AgentStage } from '$lib/utils/ai';
import { cloneEditableCard, createEmptyCard } from '$lib/utils/card';
import { createCardSnapshot } from '$lib/domain/card/draft';

export const CARD_LIST_PAGE_SIZE = 50;

export type CardScriptGenerationState = {
  isGenerating: boolean;
  stage: AgentStage | '';
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
    setStage(value: AgentStage | '') {
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
