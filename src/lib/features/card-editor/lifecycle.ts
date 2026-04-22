import { showToast } from '$lib/stores/toast.svelte';
import { loadPopularSetcodes, getSetcode } from '$lib/utils/setcode';
import { cloneEditableCard } from '$lib/utils/card';
import { createCardSnapshot } from '$lib/domain/card/draft';
import { APP_SHORTCUT_EVENT } from '$lib/utils/shortcuts';
import { resolveCardImageSrc } from '$lib/services/cardImageService';
import {
  clearWorkspaceLifecycleMetadata,
  clearWorkspaceSaveHandler,
  confirmDirtyPrompt,
  setWorkspaceLifecycleMetadata,
  setWorkspaceSaveHandler,
} from '$lib/application/workspace/lifecycle';
import type { CardDataEntry } from '$lib/types';
import {
  buildEmptyDraftState,
  buildLoadedDraftState,
  createDraftUndoHistory,
  isDraftDirty as isDraftStateDirty,
  pushDraftUndoHistory,
  type DraftUndoEntry,
} from './controller';

type Translate = (key: string, options?: Record<string, unknown>) => string;
type SetcodeOptions = Awaited<ReturnType<typeof loadPopularSetcodes>>['options'];

type CardEditorLifecycleControllerInput = {
  getCoverImageSrc: () => string | null | undefined;
  getDraftCard: () => CardDataEntry;
  setDraftCard: (card: CardDataEntry) => void;
  getOriginalCardCode: () => number | null;
  setOriginalCardCode: (code: number | null) => void;
  getLastLoadedCardSnapshot: () => string;
  setLastLoadedCardSnapshot: (snapshot: string) => void;
  setLastSyncedSelectedId: (code: number | null) => void;
  setSetcodeHexAt: (index: number, value: string) => void;
  setTrackedDraftSnapshot: (snapshot: string) => void;
  setDraftUndoHistory: (history: DraftUndoEntry[]) => void;
  mutateSuspendDraftUndoTracking: (delta: number) => void;
  nextImageRequestToken: () => number;
  isLatestImageRequestToken: (token: number) => boolean;
  clearPendingImageClick: () => void;
  getImageSrc: () => string;
  setImageSrc: (src: string) => void;
  getActiveCdbPath: () => string | null | undefined;
  isDbLoaded: () => boolean;
  saveCdbFile: () => Promise<boolean>;
  t: Translate;
};

type CardEditorMountInput = {
  t: Translate;
  setPopularSetcodes: (options: SetcodeOptions) => void;
  isDbLoaded: () => boolean;
  handleNewCard: () => void;
  handleSearchFromDraft: () => Promise<void>;
  handleEditorKeydown: (event: KeyboardEvent) => void | Promise<void>;
  cancelScriptGeneration: () => void;
  disposeImageInteraction: () => void;
  windowTarget?: Pick<Window, 'addEventListener' | 'removeEventListener'>;
};

export function createCardEditorLifecycleController(input: CardEditorLifecycleControllerInput) {
  function getDefaultCoverSrc() {
    return input.getCoverImageSrc() || '/resources/cover.jpg';
  }

  function syncSetcodesFromCard(card: CardDataEntry) {
    for (let index = 0; index < 4; index += 1) {
      input.setSetcodeHexAt(index, getSetcode(card.setcode, index).replace(/^0x/i, ''));
    }
  }

  function replaceDraftCardWithoutUndo(nextCard: CardDataEntry) {
    input.mutateSuspendDraftUndoTracking(1);
    const clonedCard = cloneEditableCard(nextCard);
    input.setDraftCard(clonedCard);
    input.mutateSuspendDraftUndoTracking(-1);
    syncSetcodesFromCard(clonedCard);
    input.setTrackedDraftSnapshot(createCardSnapshot(clonedCard));
  }

  function resetDraftUndoBaseline(nextCard: CardDataEntry = input.getDraftCard()) {
    input.setDraftUndoHistory(createDraftUndoHistory(nextCard));
    input.setTrackedDraftSnapshot(createCardSnapshot(nextCard));
  }

  function resetDraftCard() {
    const nextState = buildEmptyDraftState(getDefaultCoverSrc());
    input.setLastSyncedSelectedId(nextState.lastSyncedSelectedId);
    input.setLastLoadedCardSnapshot(nextState.lastLoadedCardSnapshot);
    input.setOriginalCardCode(nextState.originalCardCode);
    replaceDraftCardWithoutUndo(nextState.draftCard);
    resetDraftUndoBaseline(nextState.draftCard);
    input.nextImageRequestToken();
    input.clearPendingImageClick();
    input.setImageSrc(nextState.imageSrc);
  }

  function loadCardIntoDraft(card: CardDataEntry) {
    const nextState = buildLoadedDraftState(card);
    input.setLastSyncedSelectedId(nextState.lastSyncedSelectedId);
    input.setLastLoadedCardSnapshot(nextState.lastLoadedCardSnapshot);
    input.setOriginalCardCode(nextState.originalCardCode);
    replaceDraftCardWithoutUndo(nextState.draftCard);
    resetDraftUndoBaseline(nextState.draftCard);
  }

  function handleImageError(failedSrc: string) {
    if (input.getImageSrc() === failedSrc) {
      input.setImageSrc(getDefaultCoverSrc());
    }
  }

  async function refreshDraftImage(code: number, bustCache = false) {
    if (!input.getActiveCdbPath() || code <= 0) {
      input.nextImageRequestToken();
      input.clearPendingImageClick();
      input.setImageSrc(getDefaultCoverSrc());
      return;
    }

    const requestToken = input.nextImageRequestToken();
    const src = await resolveCardImageSrc(input.getActiveCdbPath() ?? '', code, bustCache);
    if (input.isLatestImageRequestToken(requestToken)) {
      input.setImageSrc(src);
    }
  }

  function handleNewCard() {
    resetDraftCard();
  }

  function isDraftDirty() {
    return isDraftStateDirty({
      draftCard: input.getDraftCard(),
      originalCardCode: input.getOriginalCardCode(),
      lastLoadedCardSnapshot: input.getLastLoadedCardSnapshot(),
    });
  }

  async function confirmDiscardDraftForKeyboardNavigation() {
    if (!isDraftDirty()) return true;

    return confirmDirtyPrompt({
      message: input.t('editor.navigate_unsaved_confirm'),
      title: input.t('editor.navigate_unsaved_title'),
      kind: 'warning',
    });
  }

  async function handleSaveWorkspace(onDirtyDraft: () => Promise<void>) {
    if (!input.isDbLoaded()) return false;

    if (isDraftDirty()) {
      await onDirtyDraft();
      if (isDraftDirty()) {
        // Draft could not be committed (validation failure or user cancelled).
        // Still attempt to flush the file so any earlier DB mutations are persisted.
        return input.saveCdbFile();
      }
      // onDirtyDraft already saved the file internally via persistActiveCdbAfterMutation.
      // Calling saveCdbFile() a second time here is redundant and occasionally fails
      // due to file-system contention, producing a spurious "Save failed" toast.
      return true;
    }

    return input.saveCdbFile();
  }

  return {
    getDefaultCoverSrc,
    syncSetcodesFromCard,
    replaceDraftCardWithoutUndo,
    resetDraftUndoBaseline,
    resetDraftCard,
    loadCardIntoDraft,
    handleImageError,
    refreshDraftImage,
    handleNewCard,
    isDraftDirty,
    confirmDiscardDraftForKeyboardNavigation,
    handleSaveWorkspace,
  };
}

export function setupCardEditorOnMount(input: CardEditorMountInput) {
  const windowTarget = input.windowTarget ?? window;

  void loadPopularSetcodes().then(({ options, duplicateSetcodes }) => {
    input.setPopularSetcodes(options);
    for (const code of duplicateSetcodes.slice(0, 3)) {
      showToast(input.t('editor.setcode_duplicates_detected', { values: { code } }), 'info', 4500);
    }
  });

  const handleShortcut: EventListener = (event) => {
    const customEvent = event as CustomEvent<string>;
    if (!input.isDbLoaded()) return;

    if (customEvent.detail === 'new-card') {
      input.handleNewCard();
      return;
    }

    if (customEvent.detail === 'search-from-draft') {
      void input.handleSearchFromDraft();
    }
  };

  windowTarget.addEventListener(APP_SHORTCUT_EVENT, handleShortcut);
  windowTarget.addEventListener('keydown', input.handleEditorKeydown as EventListener);

  return () => {
    input.cancelScriptGeneration();
    input.disposeImageInteraction();
    windowTarget.removeEventListener(APP_SHORTCUT_EVENT, handleShortcut);
    windowTarget.removeEventListener('keydown', input.handleEditorKeydown as EventListener);
  };
}

export function teardownCardEditorOnDestroy(input: {
  handleEditorKeydown: (event: KeyboardEvent) => void | Promise<void>;
  windowTarget?: Pick<Window, 'removeEventListener'>;
}) {
  (input.windowTarget ?? window).removeEventListener('keydown', input.handleEditorKeydown as EventListener);
}

export function trackDraftUndoEffect(input: {
  draftCard: CardDataEntry;
  suspendDraftUndoTracking: number;
  trackedDraftSnapshot: string;
  draftUndoHistory: DraftUndoEntry[];
  setTrackedDraftSnapshot: (snapshot: string) => void;
  setDraftUndoHistory: (history: DraftUndoEntry[]) => void;
}) {
  const snapshot = createCardSnapshot(input.draftCard);
  if (input.suspendDraftUndoTracking > 0) {
    input.setTrackedDraftSnapshot(snapshot);
    return;
  }

  if (snapshot === input.trackedDraftSnapshot) {
    return;
  }

  input.setDraftUndoHistory(pushDraftUndoHistory(input.draftUndoHistory, input.draftCard));
  input.setTrackedDraftSnapshot(snapshot);
}

export function syncLoadedDraftEffect(input: {
  isDbLoaded: boolean;
  selectedId: number | null;
  selectedCard: CardDataEntry | null;
  lastSyncedSelectedId: number | null;
  lastLoadedCardSnapshot: string;
  originalCardCode: number | null;
  loadCardIntoDraft: (card: CardDataEntry) => void;
  resetDraftCard: () => void;
  refreshDraftImage: (code: number) => void | Promise<void>;
}) {
  if (!input.isDbLoaded) {
    input.resetDraftCard();
    return;
  }

  if (input.selectedCard) {
    // Normalize before snapshot so the comparison is stable regardless of whether
    // the DB backend returns cards with un-extracted lscale/rscale fields.  This
    // must mirror the normalization performed in buildLoadedDraftState, which also
    // stores a normalized snapshot in lastLoadedCardSnapshot.
    const nextSnapshot = createCardSnapshot(cloneEditableCard(input.selectedCard));
    if (input.lastSyncedSelectedId !== input.selectedCard.code || input.lastLoadedCardSnapshot !== nextSnapshot) {
      input.loadCardIntoDraft(input.selectedCard);
      void input.refreshDraftImage(input.selectedCard.code);
    }
    return;
  }

  if (input.selectedId !== null) {
    return;
  }

  if (input.originalCardCode !== null) {
    input.resetDraftCard();
  }
}

export function syncDefaultCoverSourceEffect(input: {
  nextCoverSrc: string;
  lastDefaultCoverSrc: string;
  imageSrc: string;
  setLastDefaultCoverSrc: (src: string) => void;
  setImageSrc: (src: string) => void;
}) {
  if (input.nextCoverSrc === input.lastDefaultCoverSrc) return;

  const previousCoverSrc = input.lastDefaultCoverSrc;
  input.setLastDefaultCoverSrc(input.nextCoverSrc);
  if (input.imageSrc === previousCoverSrc) {
    input.setImageSrc(input.nextCoverSrc);
  }
}

export function ensureCapabilityModuleEffect(input: {
  enabled: boolean;
  open: boolean;
  ensureModule: () => unknown;
}) {
  if (input.enabled && input.open) {
    input.ensureModule();
  }
}

export function syncWorkspaceLifecycleEffect(input: {
  workspaceId: string | null | undefined;
  workspaceDirty: boolean;
  handleSaveWorkspace: () => boolean | Promise<boolean>;
}) {
  if (input.workspaceId) {
    setWorkspaceLifecycleMetadata(input.workspaceId, {
      dirty: input.workspaceDirty,
      closeGuard: input.workspaceDirty ? 'confirm-dirty' : 'none',
    });
    setWorkspaceSaveHandler(input.workspaceId, input.handleSaveWorkspace);
  }

  return () => {
    if (input.workspaceId) {
      clearWorkspaceLifecycleMetadata(input.workspaceId);
      clearWorkspaceSaveHandler(input.workspaceId);
    }
  };
}
