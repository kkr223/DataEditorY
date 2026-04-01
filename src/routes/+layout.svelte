<script lang="ts">
  import { onMount } from 'svelte';
  import '../app.css';
  import { setupI18n } from '$lib/i18n';
  import { _, locale, isLoading } from 'svelte-i18n';
  import { tauriBridge } from '$lib/infrastructure/tauri';
  import { analyzeCdbMerge, consumePendingOpenCdbPaths, copyCardAssets, createCdbFromCards, executeCdbMerge, packageCdbAssetsAsZip, type AnalyzeCdbMergeResponse } from '$lib/infrastructure/tauri/commands';
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
    queryCardsRaw,
    recentCdbHistory,
    removeRecentCdbHistoryEntry,
    saveCdbFile,
    saveCdbTab,
    tabs,
    undoLastOperation,
  } from '$lib/stores/db';
  import { getCardClipboard, hasCardClipboard, setCardClipboard } from '$lib/stores/cardClipboard.svelte';
  import { buildSearchQuery } from '$lib/domain/search/query';
  import { clearSelection, editorState, getAllCardsMap, getSelectedCardIds, getSelectedCards, handleSearch, setSelectedCards } from '$lib/stores/editor.svelte';
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
  let isCreateFilteredCdbOpen = $state(false);
  let copyFilteredAssets = $state(true);
  let isCreatingFilteredCdb = $state(false);
  let isMergeCdbOpen = $state(false);
  let mergePathA = $state('');
  let mergePathB = $state('');
  let mergeConflictMode = $state<'preferA' | 'preferB' | 'manual'>('preferA');
  let mergeIncludeImages = $state(true);
  let mergeIncludeScripts = $state(true);
  let isAnalyzingMerge = $state(false);
  let isMergingCdb = $state(false);
  let mergeAnalysis = $state<AnalyzeCdbMergeResponse | null>(null);
  let mergeAnalysisKey = $state('');
  let manualMergeChoices = $state<Record<number, 'a' | 'b'>>({});
  const PRELOAD_RETRY_KEY = 'dataeditory:preload-retry';

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

  function closeCreateFilteredCdbDialog() {
    if (isCreatingFilteredCdb) return;
    isCreateFilteredCdbOpen = false;
  }

  function openCreateFilteredCdbDialog() {
    if (!$activeTab?.path) {
      showToast($_('editor.package_zip_no_cdb'), 'info');
      return;
    }

    copyFilteredAssets = true;
    isCreateFilteredCdbOpen = true;
  }

  async function getCurrentFilteredCards(): Promise<CardDataEntry[]> {
    if (!$activeTab) {
      return [];
    }

    const { whereClause, params } = buildSearchQuery(editorState.searchFilters);
    return await queryCardsRaw($activeTab.id, `${whereClause} ORDER BY datas.id`, params);
  }

  async function handleCreateFilteredCdb() {
    const sourceCdbPath = $activeTab?.path ?? '';
    if (!sourceCdbPath) {
      showToast($_('editor.package_zip_no_cdb'), 'info');
      return;
    }

    isCreatingFilteredCdb = true;

    try {
      const filteredCards = await getCurrentFilteredCards();
      if (filteredCards.length === 0) {
        showToast($_('editor.create_filtered_cdb_empty'), 'info');
        return;
      }

      const outputPath = await tauriBridge.save({
        title: $_('editor.create_filtered_cdb_title'),
        defaultPath: sourceCdbPath.replace(/\.cdb$/i, '-filtered.cdb'),
        filters: [{ name: 'YGOPro CDB Database', extensions: ['cdb'] }],
      });
      if (!outputPath || typeof outputPath !== 'string') {
        return;
      }
      if (outputPath === sourceCdbPath || $tabs.some((tab) => tab.path === outputPath)) {
        showToast($_('editor.output_path_must_be_new'), 'error');
        return;
      }

      await createCdbFromCards(outputPath, filteredCards);
      await openCdbPath(outputPath);
      activateEditorView();

      if (copyFilteredAssets) {
        showToast($_('editor.create_filtered_cdb_copying_assets'), 'info');
        void copyCardAssets({
          sourceCdbPath,
          targetCdbPath: outputPath,
          cardIds: filteredCards.map((card) => card.code),
          includeImages: true,
          includeScripts: true,
        }).then(() => {
          showToast($_('editor.create_filtered_cdb_assets_copied'), 'success');
        }).catch((error) => {
          console.error('Failed to copy filtered cdb assets', error);
          void writeErrorLog({
            source: 'shell.create-filtered-cdb.copy-assets',
            error,
            extra: {
              sourceCdbPath,
              targetCdbPath: outputPath,
              cardCount: filteredCards.length,
            },
          });
          showToast($_('editor.create_filtered_cdb_assets_failed'), 'error');
        });
      }

      isCreateFilteredCdbOpen = false;
      showToast($_('editor.create_filtered_cdb_success', {
        values: { count: String(filteredCards.length) },
      }), 'success');
    } catch (error) {
      console.error('Failed to create filtered cdb', error);
      void writeErrorLog({
        source: 'shell.create-filtered-cdb',
        error,
        extra: {
          sourceCdbPath,
        },
      });
      showToast($_('editor.create_filtered_cdb_failed'), 'error');
    } finally {
      isCreatingFilteredCdb = false;
    }
  }

  function resetMergeDialogState() {
    mergePathA = $activeTab?.path ?? '';
    mergePathB = '';
    mergeConflictMode = 'preferA';
    mergeIncludeImages = true;
    mergeIncludeScripts = true;
    mergeAnalysis = null;
    mergeAnalysisKey = '';
    manualMergeChoices = {};
  }

  function openMergeCdbDialog() {
    resetMergeDialogState();
    isMergeCdbOpen = true;
  }

  function closeMergeCdbDialog() {
    if (isAnalyzingMerge || isMergingCdb) return;
    isMergeCdbOpen = false;
  }

  function basename(path: string) {
    const parts = path.split(/[/\\]/);
    return parts[parts.length - 1] || path;
  }

  async function pickMergePath(side: 'a' | 'b') {
    const selected = await tauriBridge.open({
      multiple: false,
      filters: [{ name: 'YGOPro CDB Database', extensions: ['cdb'] }],
    });
    if (!selected || typeof selected !== 'string') {
      return;
    }

    if (side === 'a') {
      mergePathA = selected;
    } else {
      mergePathB = selected;
    }
    mergeAnalysis = null;
    mergeAnalysisKey = '';
    manualMergeChoices = {};
  }

  async function handleAnalyzeMerge() {
    if (!mergePathA.trim() || !mergePathB.trim()) {
      showToast($_('editor.merge_cdb_pick_both'), 'info');
      return;
    }
    if (mergePathA === mergePathB) {
      showToast($_('editor.merge_cdb_same_source'), 'error');
      return;
    }

    isAnalyzingMerge = true;
    try {
      const analysis = await analyzeCdbMerge(mergePathA, mergePathB);
      mergeAnalysis = analysis;
      mergeAnalysisKey = `${mergePathA}::${mergePathB}`;
      manualMergeChoices = Object.fromEntries(
        analysis.conflicts.map((conflict) => [conflict.code, 'a' as const]),
      );
    } catch (error) {
      console.error('Failed to analyze cdb merge', error);
      void writeErrorLog({
        source: 'shell.merge-cdb.analyze',
        error,
        extra: { mergePathA, mergePathB },
      });
      showToast($_('editor.merge_cdb_analyze_failed'), 'error');
    } finally {
      isAnalyzingMerge = false;
    }
  }

  async function handleExecuteMerge() {
    if (!mergeAnalysis || mergeAnalysisKey !== `${mergePathA}::${mergePathB}`) {
      await handleAnalyzeMerge();
      if (!mergeAnalysis) {
        return;
      }
    }

    const outputPath = await tauriBridge.save({
      title: $_('editor.merge_cdb_title'),
      defaultPath: `merged-${basename(mergePathA).replace(/\.cdb$/i, '')}-${basename(mergePathB)}`,
      filters: [{ name: 'YGOPro CDB Database', extensions: ['cdb'] }],
    });
    if (!outputPath || typeof outputPath !== 'string') {
      return;
    }
    if ([mergePathA, mergePathB].includes(outputPath) || $tabs.some((tab) => tab.path === outputPath)) {
      showToast($_('editor.output_path_must_be_new'), 'error');
      return;
    }

    isMergingCdb = true;
    try {
      await executeCdbMerge({
        aPath: mergePathA,
        bPath: mergePathB,
        outputPath,
        conflictMode: mergeConflictMode,
        manualChoices: manualMergeChoices,
        includeImages: mergeIncludeImages,
        includeScripts: mergeIncludeScripts,
      });
      await openCdbPath(outputPath);
      activateEditorView();
      isMergeCdbOpen = false;
      showToast($_('editor.merge_cdb_success'), 'success');
    } catch (error) {
      console.error('Failed to merge cdb', error);
      void writeErrorLog({
        source: 'shell.merge-cdb.execute',
        error,
        extra: {
          mergePathA,
          mergePathB,
          outputPath,
          mergeConflictMode,
          mergeIncludeImages,
          mergeIncludeScripts,
        },
      });
      showToast($_('editor.merge_cdb_failed'), 'error');
    } finally {
      isMergingCdb = false;
    }
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

    if (key === 'r') {
      event.preventDefault();
      return;
    }

    if (key === 'p' || key === 'j') {
      event.preventDefault();
      return;
    }

    if (key === 'f' || key === 'g') {
      event.preventDefault();
      dispatchAppShortcut('focus-search');
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
        showToast('资源加载失败，请重试打开当前页面。', 'error');
        return;
      }

      sessionStorage.setItem(PRELOAD_RETRY_KEY, '1');
      window.location.reload();
    };

    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    const preloadRetryResetTimer = window.setTimeout(() => {
      sessionStorage.removeItem(PRELOAD_RETRY_KEY);
    }, 8000);

    window.addEventListener('keydown', handleGlobalKeydown);
    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('error', handleWindowError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('vite:preloadError', handlePreloadError as EventListener);
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
      window.removeEventListener('vite:preloadError', handlePreloadError as EventListener);
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
      hasActiveCdb={Boolean($activeTab?.path)}
      hasPackageTarget={Boolean(getCurrentPackageCdbPath())}
      {isOpenHistoryVisible}
      recentEntries={$recentCdbHistory}
      onOpen={handleOpen}
      onCreate={handleCreate}
      onCreateFilteredCdb={openCreateFilteredCdbDialog}
      onMergeCdb={openMergeCdbDialog}
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

    {#if isCreateFilteredCdbOpen}
      <div class="shell-dialog-backdrop" role="presentation" onclick={(event) => event.currentTarget === event.target && closeCreateFilteredCdbDialog()}>
        <div class="shell-dialog" role="dialog" aria-modal="true" aria-label={$_('editor.create_filtered_cdb_title')}>
          <div class="shell-dialog-header">
            <div>
              <h3>{$_('editor.create_filtered_cdb_title')}</h3>
              <p>{$_('editor.create_filtered_cdb_hint')}</p>
            </div>
            <button class="close-dialog-btn" type="button" onclick={closeCreateFilteredCdbDialog}>×</button>
          </div>
          <div class="shell-dialog-body">
            <label class="shell-toggle">
              <input type="checkbox" bind:checked={copyFilteredAssets} />
              <span>{$_('editor.create_filtered_cdb_copy_assets')}</span>
            </label>
            <p class="shell-dialog-hint">
              {copyFilteredAssets ? $_('editor.create_filtered_cdb_copy_assets_yes') : $_('editor.create_filtered_cdb_copy_assets_no')}
            </p>
          </div>
          <div class="shell-dialog-actions">
            <button class="btn-secondary btn-sm" type="button" onclick={closeCreateFilteredCdbDialog} disabled={isCreatingFilteredCdb}>{$_('editor.cancel')}</button>
            <button class="btn-primary btn-sm" type="button" onclick={handleCreateFilteredCdb} disabled={isCreatingFilteredCdb}>
              {isCreatingFilteredCdb ? $_('editor.create_filtered_cdb_creating') : $_('editor.create_filtered_cdb_confirm')}
            </button>
          </div>
        </div>
      </div>
    {/if}

    {#if isMergeCdbOpen}
      <div class="shell-dialog-backdrop" role="presentation" onclick={(event) => event.currentTarget === event.target && closeMergeCdbDialog()}>
        <div class="shell-dialog shell-dialog-wide" role="dialog" aria-modal="true" aria-label={$_('editor.merge_cdb_title')}>
          <div class="shell-dialog-header">
            <div>
              <h3>{$_('editor.merge_cdb_title')}</h3>
              <p>{$_('editor.merge_cdb_hint')}</p>
            </div>
            <button class="close-dialog-btn" type="button" onclick={closeMergeCdbDialog}>×</button>
          </div>
          <div class="shell-dialog-body shell-dialog-grid">
            <label class="field field-span-2">
              <span>{$_('editor.merge_cdb_a')}</span>
              <div class="path-picker-row">
                <input type="text" bind:value={mergePathA} placeholder={$_('editor.merge_cdb_pick_path')} />
                <button class="btn-secondary btn-sm" type="button" onclick={() => pickMergePath('a')}>{$_('editor.browse')}</button>
              </div>
            </label>
            <label class="field field-span-2">
              <span>{$_('editor.merge_cdb_b')}</span>
              <div class="path-picker-row">
                <input type="text" bind:value={mergePathB} placeholder={$_('editor.merge_cdb_pick_path')} />
                <button class="btn-secondary btn-sm" type="button" onclick={() => pickMergePath('b')}>{$_('editor.browse')}</button>
              </div>
            </label>
            <label class="field">
              <span>{$_('editor.merge_cdb_conflict_mode')}</span>
              <select bind:value={mergeConflictMode}>
                <option value="preferA">{$_('editor.merge_cdb_conflict_prefer_a')}</option>
                <option value="preferB">{$_('editor.merge_cdb_conflict_prefer_b')}</option>
                <option value="manual">{$_('editor.merge_cdb_conflict_manual')}</option>
              </select>
            </label>
            <label class="shell-toggle">
              <input type="checkbox" bind:checked={mergeIncludeImages} />
              <span>{$_('editor.merge_cdb_include_images')}</span>
            </label>
            <label class="shell-toggle">
              <input type="checkbox" bind:checked={mergeIncludeScripts} />
              <span>{$_('editor.merge_cdb_include_scripts')}</span>
            </label>
            <div class="field field-span-2">
              <button class="btn-secondary btn-sm" type="button" onclick={handleAnalyzeMerge} disabled={isAnalyzingMerge || isMergingCdb}>
                {isAnalyzingMerge ? $_('editor.merge_cdb_analyzing') : $_('editor.merge_cdb_analyze')}
              </button>
              {#if mergeAnalysis}
                <p class="shell-dialog-hint">{$_('editor.merge_cdb_summary', { values: { a: String(mergeAnalysis.aTotal), b: String(mergeAnalysis.bTotal), merged: String(mergeAnalysis.mergedTotal), conflicts: String(mergeAnalysis.conflicts.length) } })}</p>
              {/if}
            </div>

            {#if mergeAnalysis && mergeConflictMode === 'manual' && mergeAnalysis.conflicts.length > 0}
              <div class="field field-span-2">
                <span>{$_('editor.merge_cdb_manual_conflicts')}</span>
                <div class="merge-conflict-list">
                  {#each mergeAnalysis.conflicts as conflict}
                    <div class="merge-conflict-item">
                      <div class="merge-conflict-meta">
                        <strong>{conflict.code} · {conflict.aCard.name || conflict.bCard.name || 'Unnamed'}</strong>
                        <small>
                          {#if conflict.hasCardConflict}{$_('editor.merge_cdb_conflict_card')}{/if}
                          {#if conflict.hasImageConflict} / {$_('editor.merge_cdb_conflict_image')}{/if}
                          {#if conflict.hasFieldImageConflict} / {$_('editor.merge_cdb_conflict_field_image')}{/if}
                          {#if conflict.hasScriptConflict} / {$_('editor.merge_cdb_conflict_script')}{/if}
                        </small>
                      </div>
                      <div class="merge-choice-row">
                        <label class="shell-toggle">
                          <input type="radio" name={`merge-${conflict.code}`} checked={manualMergeChoices[conflict.code] === 'a'} onchange={() => { manualMergeChoices = { ...manualMergeChoices, [conflict.code]: 'a' }; }} />
                          <span>A · {conflict.aCard.name || conflict.code}</span>
                        </label>
                        <label class="shell-toggle">
                          <input type="radio" name={`merge-${conflict.code}`} checked={manualMergeChoices[conflict.code] === 'b'} onchange={() => { manualMergeChoices = { ...manualMergeChoices, [conflict.code]: 'b' }; }} />
                          <span>B · {conflict.bCard.name || conflict.code}</span>
                        </label>
                      </div>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
          </div>
          <div class="shell-dialog-actions">
            <button class="btn-secondary btn-sm" type="button" onclick={closeMergeCdbDialog} disabled={isAnalyzingMerge || isMergingCdb}>{$_('editor.cancel')}</button>
            <button class="btn-primary btn-sm" type="button" onclick={handleExecuteMerge} disabled={isAnalyzingMerge || isMergingCdb}>
              {isMergingCdb ? $_('editor.merge_cdb_merging') : $_('editor.merge_cdb_confirm')}
            </button>
          </div>
        </div>
      </div>
    {/if}
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

  .shell-dialog-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1600;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: rgba(2, 6, 23, 0.62);
    backdrop-filter: blur(4px);
  }

  .shell-dialog {
    width: min(560px, 94vw);
    max-height: 92vh;
    display: flex;
    flex-direction: column;
    background: var(--bg-surface);
    border: 1px solid var(--border-color);
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 24px 60px rgba(2, 6, 23, 0.32);
  }

  .shell-dialog-wide {
    width: min(920px, 96vw);
  }

  .shell-dialog-header,
  .shell-dialog-actions {
    padding: 16px 18px;
    border-bottom: 1px solid var(--border-color);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .shell-dialog-actions {
    border-bottom: none;
    border-top: 1px solid var(--border-color);
    justify-content: flex-end;
  }

  .shell-dialog-header h3 {
    margin: 0;
    font-size: 1rem;
  }

  .shell-dialog-header p,
  .shell-dialog-hint,
  .merge-conflict-meta small {
    margin: 4px 0 0;
    color: var(--text-secondary);
    font-size: 0.84rem;
  }

  .shell-dialog-body {
    padding: 18px;
    overflow: auto;
  }

  .shell-dialog-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }

  .field-span-2 {
    grid-column: span 2;
  }

  .field span {
    font-size: 0.84rem;
    color: var(--text-secondary);
    font-weight: 600;
  }

  .field input,
  .field select {
    width: 100%;
    background: var(--bg-base);
    color: var(--text-primary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 8px 10px;
    font-size: 0.92rem;
  }

  .shell-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border: 1px solid var(--border-color);
    border-radius: 10px;
    background: var(--bg-base);
    min-width: 0;
  }

  .shell-toggle input {
    width: auto;
    margin: 0;
  }

  .path-picker-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
  }

  .merge-conflict-list {
    margin-top: 8px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-height: 320px;
    overflow: auto;
  }

  .merge-conflict-item {
    padding: 12px;
    border: 1px solid var(--border-color);
    border-radius: 12px;
    background: var(--bg-base);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .merge-conflict-meta {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .merge-choice-row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .btn-sm {
    padding: 0.42rem 0.8rem;
    font-size: 0.84rem;
    font-weight: 700;
    border-radius: 8px;
    border: none;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-primary {
    background: linear-gradient(135deg, #2563eb, #1d4ed8);
    color: #fff;
  }

  .btn-secondary {
    background: rgba(148, 163, 184, 0.14);
    color: var(--text-primary);
    border: 1px solid rgba(148, 163, 184, 0.22);
  }

  .close-dialog-btn {
    width: 32px;
    height: 32px;
    padding: 0;
    font-size: 1.35rem;
    line-height: 1;
    border-radius: 999px;
    background: var(--bg-surface-active);
    color: var(--text-primary);
    border: none;
    cursor: pointer;
  }

  @media (max-width: 720px) {
    .shell-dialog-grid,
    .merge-choice-row,
    .path-picker-row {
      grid-template-columns: 1fr;
    }

    .field-span-2 {
      grid-column: span 1;
    }
  }
</style>
