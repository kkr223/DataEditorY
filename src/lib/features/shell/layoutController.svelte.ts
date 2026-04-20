import { get, fromStore } from 'svelte/store';
import { _, locale } from 'svelte-i18n';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { tauriBridge } from '$lib/infrastructure/tauri';
import { consumePendingOpenCdbPaths } from '$lib/infrastructure/tauri/commands';
import {
  deleteCards,
  getCardsByIds,
  getLastUndoLabel,
  hasUndoableAction,
  isDbLoaded,
  loadRecentCdbHistory,
  modifyCards,
  openCdbHistoryEntry,
  openCdbPath,
  recentCdbHistory,
  removeRecentCdbHistoryEntry,
  undoLastOperation,
  type RecentCdbEntry,
  activeTabId,
} from '$lib/stores/db';
import {
  scriptTabs,
} from '$lib/stores/scriptEditor.svelte';
import { loadAppSettings } from '$lib/stores/appSettings.svelte';
import { getCardClipboard, hasCardClipboard, setCardClipboard } from '$lib/stores/cardClipboard.svelte';
import {
  clearSelection,
  getAllCardsMap,
  getSelectedCardIds,
  getSelectedCards,
  handleSearch,
  setSelectedCards,
} from '$lib/stores/editor.svelte';
import { showToast } from '$lib/stores/toast.svelte';
import { dispatchAppShortcut } from '$lib/utils/shortcuts';
import { writeErrorLog } from '$lib/utils/errorLog';
import {
  type DragDropPayload,
  isCdbFilePath,
  isEditableTarget,
  isNativeTextUndoTarget,
  normalizeExternalOpenPaths,
} from '$lib/features/shell/controller';
import {
  activateWorkspaceDocument,
  closeWorkspaceDocument,
  createDbWorkspace,
  openDbWorkspace,
  saveActiveWorkspaceDocument,
} from '$lib/application/workspace/commandBus';
import {
  confirmWorkspaceClose,
  hasDirtyWorkspaceDocuments,
} from '$lib/application/workspace/lifecycle';
import { getEnabledCapabilities } from '$lib/application/capabilities/registry';
import { workspaceState } from '$lib/core/workspace/store.svelte';
import type { CardDataEntry } from '$lib/types';

const PRELOAD_RETRY_KEY = 'dataeditory:preload-retry';
const OPEN_HISTORY_HIDE_DELAY_MS = 180;
const MAX_DIRTY_DOCUMENT_NAMES = 5;

const recentHistoryState = fromStore(recentCdbHistory);
const isDbLoadedState = fromStore(isDbLoaded);
const scriptTabsState = fromStore(scriptTabs);

export function createShellLayoutController() {
  const state = $state({
    theme: 'dark' as 'dark' | 'light',
    isOpenHistoryVisible: false,
    isFileDragActive: false,
    dragOverlayMessage: '',
  });

  let openHistoryHideTimer: ReturnType<typeof setTimeout> | null = null;
  let isForceClosingWindow = false;

  function getDirtyWorkspaceDocuments() {
    return workspaceState.documents.filter((document) => document.dirty);
  }

  function buildAppCloseConfirmationMessage() {
    const dirtyDocuments = getDirtyWorkspaceDocuments();
    if (dirtyDocuments.length === 0) {
      return '';
    }

    const names = dirtyDocuments
      .slice(0, MAX_DIRTY_DOCUMENT_NAMES)
      .map((document) => document.title)
      .join('、');
    const remainingCount = Math.max(0, dirtyDocuments.length - MAX_DIRTY_DOCUMENT_NAMES);

    return String(get(_)(
      'editor.unsaved_exit_confirm',
      { values: { count: String(dirtyDocuments.length), names, remainingCount: String(remainingCount) } } as never,
    ));
  }

  function applyTheme(next: 'dark' | 'light') {
    state.theme = next;
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
  }

  function toggleLanguage() {
    locale.set(get(locale) === 'en' ? 'zh' : 'en');
  }

  function toggleTheme() {
    applyTheme(state.theme === 'dark' ? 'light' : 'dark');
  }

  async function handleOpen() {
    await openDbWorkspace();
  }

  async function handleCreate() {
    await createDbWorkspace();
  }

  function showOpenHistory() {
    if (openHistoryHideTimer) {
      clearTimeout(openHistoryHideTimer);
      openHistoryHideTimer = null;
    }
    state.isOpenHistoryVisible = true;
  }

  function hideOpenHistoryWithDelay() {
    if (openHistoryHideTimer) {
      clearTimeout(openHistoryHideTimer);
    }

    openHistoryHideTimer = setTimeout(() => {
      state.isOpenHistoryVisible = false;
      openHistoryHideTimer = null;
    }, OPEN_HISTORY_HIDE_DELAY_MS);
  }

  function hideOpenHistoryImmediately() {
    if (openHistoryHideTimer) {
      clearTimeout(openHistoryHideTimer);
      openHistoryHideTimer = null;
    }
    state.isOpenHistoryVisible = false;
  }

  async function handleOpenRecent(path: string) {
    const openedId = await openCdbHistoryEntry(path);
    if (!openedId) {
      showToast('Open recent failed', 'error');
      return;
    }

    activateWorkspaceDocument(openedId);
  }

  function handleRemoveRecent(path: string) {
    removeRecentCdbHistoryEntry(path);
  }

  async function handleExternalOpenPaths(paths: string[]) {
    const filteredPaths = normalizeExternalOpenPaths(paths);
    if (filteredPaths.length === 0) {
      return;
    }

    let firstOpenedId: string | null = null;
    for (const path of filteredPaths) {
      const openedId = await openCdbPath(path);
      if (openedId && !firstOpenedId) {
        firstOpenedId = openedId;
      }
    }

    if (firstOpenedId) {
      activateWorkspaceDocument(firstOpenedId);
    }
  }

  function updateFileDragState(paths: string[] = []) {
    const hasCdb = paths.some((path) => isCdbFilePath(path));
    state.isFileDragActive = hasCdb;
    state.dragOverlayMessage = hasCdb ? 'Drop .cdb to open' : 'Unsupported file';
  }

  function clearFileDragState() {
    state.isFileDragActive = false;
    state.dragOverlayMessage = '';
  }

  async function handleSave() {
    const ok = await saveActiveWorkspaceDocument();
    showToast(ok ? 'Saved' : 'Save failed', ok ? 'success' : 'error');
  }

  async function handleCloseWorkspace(workspaceId: string) {
    const workspace = workspaceState.documents.find((document) => document.id === workspaceId);
    if (!workspace) return;

    if (!(await confirmWorkspaceClose(workspace))) {
      return;
    }

    await closeWorkspaceDocument(workspaceId);
  }

  async function handleCopySelection() {
    const selectedCards = getSelectedCards();
    if (selectedCards.length === 0) {
      showToast('Clipboard is empty', 'info');
      return;
    }

    setCardClipboard(selectedCards);
    showToast(`Copied ${selectedCards.length} cards`, 'success');
  }

  async function handlePasteSelection() {
    if (!isDbLoadedState.current) return;
    if (!hasCardClipboard()) {
      showToast('Clipboard is empty', 'info');
      return;
    }

    const clipboardCards = getCardClipboard();
    const conflictingCards = await getCardsByIds(clipboardCards.map((card) => card.code));
    if (conflictingCards.length > 0) {
      const shouldOverwrite = await tauriBridge.ask(
        `Overwrite ${conflictingCards.length} existing cards?`,
        {
          title: 'Paste conflicts',
          kind: 'warning',
        },
      );

      if (!shouldOverwrite) return;
    }

    const pastedCards = clipboardCards.map((card) => ({
      ...card,
      setcode: Array.isArray(card.setcode) ? [...card.setcode] : [],
      strings: Array.isArray(card.strings) ? [...card.strings] : [],
    } satisfies CardDataEntry));
    const ok = await modifyCards(pastedCards);
    if (!ok) {
      showToast('Paste failed', 'error');
      return;
    }

    const prevSelectedIds = getSelectedCardIds();
    await handleSearch(true);
    const visibleIds = pastedCards
      .map((card) => card.code)
      .filter((code) => getAllCardsMap().has(code));

    if (visibleIds.length > 0) {
      setSelectedCards(visibleIds, visibleIds[0], visibleIds[0]);
    } else if (prevSelectedIds.length === 0) {
      clearSelection();
    }

    showToast(`Pasted ${pastedCards.length} cards`, 'success');
  }

  async function handleDeleteSelection() {
    if (!isDbLoadedState.current) return;

    const selectedIds = getSelectedCardIds();
    if (selectedIds.length === 0) {
      showToast('No card selected', 'info');
      return;
    }

    const confirmed = await tauriBridge.ask(`Delete ${selectedIds.length} selected cards?`, {
      title: 'Delete selected cards',
      kind: 'warning',
    });

    if (!confirmed) return;

    const ok = await deleteCards(selectedIds);
    if (!ok) {
      showToast('Delete failed', 'error');
      return;
    }

    await handleSearch();
    showToast(`Deleted ${selectedIds.length} cards`, 'success');
  }

  async function handleUndoLastOperation() {
    if (!isDbLoadedState.current || !hasUndoableAction()) return;

    const lastUndoLabel = getLastUndoLabel();
    const detail = lastUndoLabel
      ? String(get(_)('editor.undo_last_action', { values: { action: lastUndoLabel } } as never))
      : '';
    const confirmed = await tauriBridge.ask(
      String(get(_)('editor.undo_confirm', { values: { detail: detail ? `\n${detail}` : '' } } as never)),
      {
        title: String(get(_)('editor.undo_title')),
        kind: 'warning',
      },
    );

    if (!confirmed) return;

    const ok = await undoLastOperation();
    if (!ok) {
      showToast(String(get(_)('editor.undo_failed')), 'error');
      return;
    }

    await handleSearch(true);
    showToast(String(get(_)('editor.undo_success')), 'success');
  }

  function handleGlobalKeydown(event: KeyboardEvent) {
    if (event.defaultPrevented || event.repeat || event.isComposing) return;

    const key = event.key.toLowerCase();
    if (key === 'f5' || key === 'f7') {
      event.preventDefault();
      return;
    }

    if (key === 'f3') {
      event.preventDefault();
      dispatchAppShortcut('focus-search');
      return;
    }

    const isPrimary = event.ctrlKey || event.metaKey;
    if (!isPrimary || event.altKey) return;
    const editable = isEditableTarget(event.target);
    const nativeTextUndoTarget = isNativeTextUndoTarget(event.target);

    if (key === 'r' || key === 'p' || key === 'j') {
      event.preventDefault();
      return;
    }

    if (key === 'f' || key === 'g') {
      event.preventDefault();
      dispatchAppShortcut('focus-search');
      return;
    }

    if (key === 'z' && !event.shiftKey) {
      if (nativeTextUndoTarget) {
        return;
      }

      event.preventDefault();
      void handleUndoLastOperation();
      return;
    }

    if (editable && key !== 's') {
      return;
    }

    if (key === 'o' && !event.shiftKey) {
      event.preventDefault();
      void handleOpen();
      return;
    }

    if (key === 'n' && !event.shiftKey) {
      event.preventDefault();
      void handleCreate();
      return;
    }

    if (key === 'n' && event.shiftKey) {
      event.preventDefault();
      dispatchAppShortcut('new-card');
      return;
    }

    if (key === 's' && !event.shiftKey) {
      event.preventDefault();
      void handleSave();
      return;
    }

    if (!editable && key === 'c' && !event.shiftKey) {
      event.preventDefault();
      void handleCopySelection();
      return;
    }

    if (!editable && key === 'v' && !event.shiftKey) {
      event.preventDefault();
      void handlePasteSelection();
      return;
    }

    if (!editable && key === 'd' && !event.shiftKey) {
      event.preventDefault();
      void handleDeleteSelection();
      return;
    }

  }

  function setup() {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') {
      applyTheme(saved);
    } else {
      applyTheme('dark');
    }

    void loadAppSettings();
    loadRecentCdbHistory();
    const unlisteners: Array<() => void> = [];

    if (tauriBridge.isTauri()) {
      void consumePendingOpenCdbPaths()
        .then((paths) => handleExternalOpenPaths(paths))
        .catch((error) => {
          console.error('Failed to consume pending cdb paths:', error);
          void writeErrorLog({ source: 'shell.consume-pending-open-cdb-paths', error });
        });

      void tauriBridge.listen<string[]>('open-cdb-paths', (event) => {
        void handleExternalOpenPaths(event.payload);
      }).then((unlisten) => {
        unlisteners.push(unlisten);
      });

      void tauriBridge.listen<DragDropPayload>(tauriBridge.TauriEvent.DRAG_DROP, (event) => {
        clearFileDragState();
        void handleExternalOpenPaths(event.payload?.paths ?? []);
      }).then((unlisten) => {
        unlisteners.push(unlisten);
      });

      void tauriBridge.listen<DragDropPayload>(tauriBridge.TauriEvent.DRAG_ENTER, (event) => {
        updateFileDragState(event.payload?.paths ?? []);
      }).then((unlisten) => {
        unlisteners.push(unlisten);
      });

      void tauriBridge.listen(tauriBridge.TauriEvent.DRAG_LEAVE, () => {
        clearFileDragState();
      }).then((unlisten) => {
        unlisteners.push(unlisten);
      });
    }

    const handleWindowError = (event: ErrorEvent) => {
      void writeErrorLog({
        source: 'window.error',
        error: event.error ?? event.message,
        extra: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        },
      });
    };
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      void writeErrorLog({
        source: 'window.unhandledrejection',
        error: event.reason,
      });
    };
    const handlePreloadError = (event: Event) => {
      const preloadEvent = event as Event & {
        payload?: unknown;
        preventDefault?: () => void;
      };
      preloadEvent.preventDefault?.();
      void writeErrorLog({
        source: 'window.vite-preload-error',
        error: preloadEvent.payload ?? 'Unknown preload error',
      });

      if (sessionStorage.getItem(PRELOAD_RETRY_KEY) === '1') {
        sessionStorage.removeItem(PRELOAD_RETRY_KEY);
        showToast('Resource preload failed. Please reopen the current page.', 'error');
        return;
      }

      sessionStorage.setItem(PRELOAD_RETRY_KEY, '1');
      window.location.reload();
    };

    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasDirtyWorkspaceDocuments(workspaceState.documents)) {
        return;
      }

      event.preventDefault();
      event.returnValue = get(_)('editor.unsaved_close_title') as string;
    };
    const handleWindowCloseRequested = async (event: { preventDefault: () => void }) => {
      if (isForceClosingWindow || !hasDirtyWorkspaceDocuments(workspaceState.documents)) {
        return;
      }

      event.preventDefault();
      const confirmed = await tauriBridge.ask(buildAppCloseConfirmationMessage(), {
        title: String(get(_)('editor.unsaved_close_title')),
        kind: 'warning',
      });
      if (!confirmed) {
        return;
      }

      isForceClosingWindow = true;
      await getCurrentWindow().destroy();
    };

    const preloadRetryResetTimer = window.setTimeout(() => {
      sessionStorage.removeItem(PRELOAD_RETRY_KEY);
    }, 8000);

    window.addEventListener('keydown', handleGlobalKeydown);
    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('error', handleWindowError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('vite:preloadError', handlePreloadError as EventListener);
    let closeRequestUnlisten: (() => void) | null = null;
    if (tauriBridge.isTauri()) {
      const appWindow = getCurrentWindow();
      void appWindow.onCloseRequested(handleWindowCloseRequested).then((unlisten) => {
        closeRequestUnlisten = unlisten;
      });
    }

    return () => {
      window.clearTimeout(preloadRetryResetTimer);
      if (openHistoryHideTimer) {
        clearTimeout(openHistoryHideTimer);
        openHistoryHideTimer = null;
      }
      for (const unlisten of unlisteners) {
        unlisten();
      }
      window.removeEventListener('keydown', handleGlobalKeydown);
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('error', handleWindowError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('vite:preloadError', handlePreloadError as EventListener);
      closeRequestUnlisten?.();
    };
  }

  return {
    state,
    workspaceState,
    capabilities: getEnabledCapabilities(),
    recentEntries: recentHistoryState,
    activeTabId,
    scriptTabsState,
    handleOpen,
    handleCreate,
    handleSave,
    handleCloseWorkspace,
    toggleLanguage,
    toggleTheme,
    showOpenHistory,
    hideOpenHistoryWithDelay,
    hideOpenHistoryImmediately,
    handleOpenRecent,
    handleRemoveRecent,
    activateWorkspaceDocument,
    setup,
  };
}
