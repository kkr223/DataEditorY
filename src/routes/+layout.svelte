<script lang="ts">
  import { onMount } from 'svelte';
  import '../app.css';
  import { setupI18n } from '$lib/i18n';
  import { _, locale, isLoading } from 'svelte-i18n';
  import { tauriBridge } from '$lib/infrastructure/tauri';
  import { consumePendingOpenCdbPaths, packageCdbAssetsAsZip } from '$lib/infrastructure/tauri/commands';
  import type { CardDataEntry } from '$lib/types';
  import {
    activeTab,
    activeTabId,
    closeTab,
    createCdbFile,
    deleteCards,
    getCardById,
    getLastUndoLabel,
    hasUndoableAction,
    hasUnsavedChanges,
    isDbLoaded,
    loadRecentCdbHistory,
    modifyCards,
    openCdbFile,
    openCdbHistoryEntry,
    openCdbPath,
    recentCdbHistory,
    removeRecentCdbHistoryEntry,
    saveCdbFile,
    saveCdbTab,
    tabs,
    undoLastOperation,
  } from '$lib/stores/db';
  import { getCardClipboard, hasCardClipboard, setCardClipboard } from '$lib/stores/cardClipboard.svelte';
  import { clearSelection, getAllCardsMap, getSelectedCardIds, getSelectedCards, handleSearch, setSelectedCards } from '$lib/stores/editor.svelte';
  import { activateScriptTab, activeScriptTab, activeScriptTabId, closeScriptTab, getScriptTabDisplayName, hasUnsavedScriptChanges, saveActiveScriptTab, scriptTabs } from '$lib/stores/scriptEditor.svelte';
  import { showToast } from '$lib/stores/toast.svelte';
  import { dispatchAppShortcut } from '$lib/utils/shortcuts';
  import { appShellState, activateEditorView, closeSettingsView, openSettingsView } from '$lib/stores/appShell.svelte';
  import { loadAppSettings } from '$lib/stores/appSettings.svelte';
  import { writeErrorLog } from '$lib/utils/errorLog';
  import Toast from '$lib/components/Toast.svelte';
  import AppTopBar from '$lib/features/shell/components/AppTopBar.svelte';
  import AppTabBar from '$lib/features/shell/components/AppTabBar.svelte';
  import FileDragOverlay from '$lib/features/shell/components/FileDragOverlay.svelte';
  import { type DragDropPayload, isCdbFilePath, isEditableTarget, normalizeExternalOpenPaths } from '$lib/features/shell/controller';

  setupI18n();

  let { children } = $props();
  let theme = $state<'dark' | 'light'>('dark');
  let isOpenHistoryVisible = $state(false);
  let openHistoryHideTimer: ReturnType<typeof setTimeout> | null = null;
  let isFileDragActive = $state(false);
  let dragOverlayMessage = $state('');

  const OPEN_HISTORY_HIDE_DELAY_MS = 180;

  function applyTheme(next: 'dark' | 'light') {
    theme = next;
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
  }

  function toggleLanguage() {
    locale.set($locale === 'en' ? 'zh' : 'en');
  }

  function toggleTheme() {
    applyTheme(theme === 'dark' ? 'light' : 'dark');
  }

  async function handleOpen() {
    await openCdbFile();
    activateEditorView();
  }

  function showOpenHistory() {
    if (openHistoryHideTimer) {
      clearTimeout(openHistoryHideTimer);
      openHistoryHideTimer = null;
    }
    isOpenHistoryVisible = true;
  }

  function hideOpenHistoryWithDelay() {
    if (openHistoryHideTimer) {
      clearTimeout(openHistoryHideTimer);
    }

    openHistoryHideTimer = setTimeout(() => {
      isOpenHistoryVisible = false;
      openHistoryHideTimer = null;
    }, OPEN_HISTORY_HIDE_DELAY_MS);
  }

  function hideOpenHistoryImmediately() {
    if (openHistoryHideTimer) {
      clearTimeout(openHistoryHideTimer);
      openHistoryHideTimer = null;
    }
    isOpenHistoryVisible = false;
  }

  async function handleOpenRecent(path: string) {
    const openedId = await openCdbHistoryEntry(path);
    if (!openedId) {
      showToast($_('nav.open_recent_failed'), 'error');
      return;
    }
    activateEditorView();
  }

  function handleRemoveRecent(path: string) {
    removeRecentCdbHistoryEntry(path);
  }

  async function handleExternalOpenPaths(paths: string[]) {
    const filteredPaths = normalizeExternalOpenPaths(paths);
    if (filteredPaths.length === 0) {
      return;
    }

    let hasOpened = false;
    for (const path of filteredPaths) {
      const openedId = await openCdbPath(path);
      hasOpened = hasOpened || Boolean(openedId);
    }

    if (hasOpened) {
      activateEditorView();
    }
  }

  function updateFileDragState(paths: string[] = []) {
    const hasCdb = paths.some((path) => isCdbFilePath(path));
    isFileDragActive = hasCdb;
    dragOverlayMessage = hasCdb ? $_('nav.drag_open_cdb') : $_('nav.drag_invalid_file');
  }

  function clearFileDragState() {
    isFileDragActive = false;
    dragOverlayMessage = '';
  }

  async function handleCreate() {
    await createCdbFile();
    activateEditorView();
  }

  async function handleSave() {
    if (appShellState.mainView === 'script') {
      const ok = await saveActiveScriptTab();
      showToast($_(ok ? 'editor.script_save_success' : 'editor.script_save_failed'), ok ? 'success' : 'error');
      return;
    }

    const ok = await saveCdbFile();
    showToast($_(ok ? 'editor.save_success' : 'editor.save_failed'), ok ? 'success' : 'error');
  }

  function getCurrentPackageCdbPath() {
    if (appShellState.mainView === 'script' && $activeScriptTab?.cdbPath) {
      return $activeScriptTab.cdbPath;
    }

    return $activeTab?.path ?? null;
  }

  async function ensureCurrentContextSavedForPackaging(targetCdbPath: string) {
    if (appShellState.mainView === 'script' && $activeScriptTab?.cdbPath === targetCdbPath && $activeScriptTab.isDirty) {
      const confirmed = await tauriBridge.ask($_('editor.package_zip_unsaved_script_confirm'), {
        title: $_('editor.package_zip_unsaved_title'),
        kind: 'warning',
      });
      if (!confirmed) return false;

      const ok = await saveActiveScriptTab();
      if (!ok) {
        showToast($_('editor.script_save_failed'), 'error');
        return false;
      }
    }

    const sourceTab = $tabs.find((item) => item.path === targetCdbPath) ?? null;
    if (sourceTab?.isDirty) {
      const confirmed = await tauriBridge.ask($_('editor.package_zip_unsaved_cdb_confirm', {
        values: { name: sourceTab.name },
      }), {
        title: $_('editor.package_zip_unsaved_title'),
        kind: 'warning',
      });
      if (!confirmed) return false;

      const ok = await saveCdbTab(sourceTab.id);
      if (!ok) {
        showToast($_('editor.save_failed'), 'error');
        return false;
      }
    }

    return true;
  }

  async function handlePackageZip() {
    const cdbPath = getCurrentPackageCdbPath();
    if (!cdbPath) {
      showToast($_('editor.package_zip_no_cdb'), 'info');
      return;
    }

    if (!(await ensureCurrentContextSavedForPackaging(cdbPath))) {
      return;
    }

    const outputPath = await tauriBridge.save({
      defaultPath: cdbPath.replace(/\.cdb$/i, '.zip'),
      filters: [{ name: 'ZIP', extensions: ['zip'] }],
    });
    if (!outputPath) {
      return;
    }

    try {
      const result = await packageCdbAssetsAsZip(cdbPath, outputPath);
      showToast($_('editor.package_zip_success', { values: { path: result.path } }), 'success', 3200);
    } catch (error) {
      console.error('Failed to package cdb assets as zip', error);
      void writeErrorLog({
        source: 'shell.package-cdb-assets-as-zip',
        error,
        extra: {
          cdbPath,
          outputPath,
        },
      });
      showToast($_('editor.package_zip_failed'), 'error');
    }
  }

  async function handleCloseTab(tabId: string) {
    const tab = $tabs.find((item) => item.id === tabId);
    if (!tab) return;

    if (hasUnsavedChanges(tabId)) {
      const confirmed = await tauriBridge.ask($_('editor.unsaved_close_confirm', {
        values: { name: tab.name },
      }), {
        title: $_('editor.unsaved_close_title'),
        kind: 'warning',
      });

      if (!confirmed) return;
    }

    await closeTab(tabId);
  }

  async function handleCloseScriptTab(tabId: string) {
    const tab = $scriptTabs.find((item) => item.id === tabId);
    if (!tab) return;

    if (hasUnsavedScriptChanges(tabId)) {
      const confirmed = await tauriBridge.ask($_('editor.unsaved_close_confirm', {
        values: { name: getScriptTabDisplayName(tab) },
      }), {
        title: $_('editor.unsaved_close_title'),
        kind: 'warning',
      });

      if (!confirmed) return;
    }

    closeScriptTab(tabId);
  }

  async function handleCopySelection() {
    const selectedCards = getSelectedCards();
    if (selectedCards.length === 0) {
      showToast($_('editor.clipboard_empty'), 'info');
      return;
    }

    setCardClipboard(selectedCards);
    showToast($_('editor.cards_copied', { values: { count: String(selectedCards.length) } }), 'success');
  }

  async function handlePasteSelection() {
    if (!$isDbLoaded) return;
    if (!hasCardClipboard()) {
      showToast($_('editor.clipboard_empty'), 'info');
      return;
    }

    const clipboardCards = getCardClipboard();
    const existingCards = await Promise.all(clipboardCards.map((card) => getCardById(card.code)));
    const conflictingCards = existingCards.filter((card) => card !== undefined);
    if (conflictingCards.length > 0) {
      const shouldOverwrite = await tauriBridge.ask($_('editor.paste_conflict_confirm', {
        values: { count: String(conflictingCards.length) },
      }), {
        title: $_('editor.paste_conflict_title'),
        kind: 'warning',
      });

      if (!shouldOverwrite) return;
    }

    const pastedCards = clipboardCards.map((card) => ({
      ...card,
      setcode: Array.isArray(card.setcode) ? [...card.setcode] : [],
      strings: Array.isArray(card.strings) ? [...card.strings] : [],
    } satisfies CardDataEntry));
    const ok = await modifyCards(pastedCards);
    if (!ok) {
      showToast($_('editor.save_failed'), 'error');
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

    showToast($_('editor.cards_pasted', { values: { count: String(pastedCards.length) } }), 'success');
  }

  async function handleDeleteSelection() {
    if (!$isDbLoaded) return;

    const selectedIds = getSelectedCardIds();
    if (selectedIds.length === 0) {
      showToast($_('editor.no_card_selected'), 'info');
      return;
    }

    const confirmed = await tauriBridge.ask($_('editor.delete_selected_confirm', {
      values: { count: String(selectedIds.length) },
    }), {
      title: $_('editor.delete_selected_title'),
      kind: 'warning',
    });

    if (!confirmed) return;

    const ok = await deleteCards(selectedIds);
    if (!ok) {
      showToast($_('editor.save_failed'), 'error');
      return;
    }

    await handleSearch();
    showToast($_('editor.cards_deleted', { values: { count: String(selectedIds.length) } }), 'success');
  }

  async function handleUndoLastOperation() {
    if (!$isDbLoaded || !hasUndoableAction()) return;

    const lastUndoLabel = getLastUndoLabel();
    const message = $_('editor.undo_confirm', {
      values: {
        detail: lastUndoLabel ? `\n\n${$_('editor.undo_last_action', { values: { action: lastUndoLabel } })}` : '',
      },
    });
    const title = $_('editor.undo_title');

    const confirmed = await tauriBridge.ask(message, {
      title,
      kind: 'warning',
    });

    if (!confirmed) return;

    const ok = await undoLastOperation();
    if (!ok) {
      showToast($_('editor.undo_failed'), 'error');
      return;
    }

    await handleSearch(true);
    showToast($_('editor.undo_success'), 'success');
  }

  function handleGlobalKeydown(event: KeyboardEvent) {
    if (event.defaultPrevented || event.repeat || event.isComposing) return;

    if (event.key === 'F5') {
      event.preventDefault();
      return;
    }

    const isPrimary = event.ctrlKey || event.metaKey;
    if (!isPrimary || event.altKey) return;
    const editable = isEditableTarget(event.target);

    const key = event.key.toLowerCase();

    if (key === 'r' && !event.shiftKey) {
      event.preventDefault();
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

    if (!editable && key === 'z' && !event.shiftKey) {
      event.preventDefault();
      void handleUndoLastOperation();
      return;
    }

    if (key === 'f' && !event.shiftKey) {
      event.preventDefault();
      dispatchAppShortcut('focus-search');
    }
  }

  onMount(() => {
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

    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    window.addEventListener('keydown', handleGlobalKeydown);
    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('error', handleWindowError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    return () => {
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
    };
  });
</script>

<Toast />

{#if $isLoading}
  <div class="loading-shell">
    Loading translations...
  </div>
{:else}
  <div class="app-container">
    <AppTopBar
      {theme}
      hasPackageTarget={Boolean(getCurrentPackageCdbPath())}
      {isOpenHistoryVisible}
      recentEntries={$recentCdbHistory}
      onOpen={handleOpen}
      onCreate={handleCreate}
      onOpenSettings={openSettingsView}
      onPackageZip={handlePackageZip}
      onToggleTheme={toggleTheme}
      onToggleLanguage={toggleLanguage}
      onShowOpenHistory={showOpenHistory}
      onHideOpenHistory={hideOpenHistoryWithDelay}
      onHideOpenHistoryImmediately={hideOpenHistoryImmediately}
      onOpenRecent={handleOpenRecent}
      onRemoveRecent={handleRemoveRecent}
    />

    <AppTabBar
      settingsOpen={appShellState.settingsOpen}
      mainView={appShellState.mainView}
      tabs={$tabs}
      activeTabId={$activeTabId}
      scriptTabs={$scriptTabs}
      activeScriptTabId={$activeScriptTabId}
      {getScriptTabDisplayName}
      onOpenSettings={openSettingsView}
      onCloseSettings={closeSettingsView}
      onActivateTab={(tabId) => { activeTabId.set(tabId); activateEditorView(); }}
      onCloseTab={handleCloseTab}
      onActivateScriptTab={activateScriptTab}
      onCloseScriptTab={handleCloseScriptTab}
      onOpenAnother={handleOpen}
    />

    <main class="main-content">
      {@render children()}
      <FileDragOverlay
        active={isFileDragActive}
        message={dragOverlayMessage || $_('nav.drag_open_cdb')}
        hint={$_('nav.drag_open_cdb_hint')}
      />
    </main>
  </div>
{/if}

<style>
  .loading-shell {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100vh;
    color: var(--text-secondary);
  }

  .app-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100vw;
  }

  .main-content {
    flex: 1;
    overflow: hidden;
    background-color: var(--bg-base);
    position: relative;
  }
</style>
