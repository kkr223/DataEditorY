import { get, fromStore } from 'svelte/store';
import { _ } from 'svelte-i18n';
import { tauriBridge } from '$lib/infrastructure/tauri';
import {
  analyzeCdbMerge,
  copyCardAssets,
  createCdbFromCards,
  executeCdbMerge,
  packageCdbAssetsAsZip,
  type AnalyzeCdbMergeResponse,
} from '$lib/infrastructure/tauri/commands';
import {
  activeTab,
  openCdbPath,
  queryCardsRaw,
  tabs,
} from '$lib/stores/db';
import { activeScriptTab } from '$lib/stores/scriptEditor.svelte';
import { appShellState } from '$lib/stores/appShell.svelte';
import { buildSearchQuery } from '$lib/domain/search/query';
import { editorState } from '$lib/stores/editor.svelte';
import { showToast } from '$lib/stores/toast.svelte';
import { writeErrorLog } from '$lib/utils/errorLog';
import type { CardDataEntry } from '$lib/types';
import {
  buildMergeAnalysisKey,
  isNewOutputPath,
} from '$lib/features/shell/dialogsHelpers';
import { workspaceState } from '$lib/core/workspace/store.svelte';
import {
  activateWorkspaceDocument,
  saveWorkspaceDocument,
} from '$lib/application/workspace/commandBus';

const activeTabState = fromStore(activeTab);
const activeScriptTabState = fromStore(activeScriptTab);
const tabsState = fromStore(tabs);

function t(key: string, options?: Record<string, unknown>) {
  return String(get(_)(key, options as never));
}

export function createShellDialogsController() {
  const state = $state({
    isCreateFilteredCdbOpen: false,
    copyFilteredAssets: true,
    isCreatingFilteredCdb: false,
    isMergeCdbOpen: false,
    mergePathA: '',
    mergePathB: '',
    mergeConflictMode: 'preferA' as 'preferA' | 'preferB' | 'manual',
    mergeIncludeImages: true,
    mergeIncludeScripts: true,
    isAnalyzingMerge: false,
    isMergingCdb: false,
    isPackageMenuVisible: false,
    mergeAnalysis: null as AnalyzeCdbMergeResponse | null,
    mergeAnalysisKey: '',
    manualMergeChoices: {} as Record<number, 'a' | 'b'>,
  });

  function getCurrentPackageCdbPath() {
    if (appShellState.mainView === 'script' && activeScriptTabState.current?.cdbPath) {
      return activeScriptTabState.current.cdbPath;
    }

    return activeTabState.current?.path ?? null;
  }

  function closeCreateFilteredCdbDialog() {
    if (state.isCreatingFilteredCdb) return;
    state.isCreateFilteredCdbOpen = false;
  }

  function openCreateFilteredCdbDialog() {
    if (!activeTabState.current?.path) {
      showToast(t('editor.package_zip_no_cdb'), 'info');
      return;
    }

    state.copyFilteredAssets = true;
    state.isCreateFilteredCdbOpen = true;
  }

  async function getCurrentFilteredCards(): Promise<CardDataEntry[]> {
    if (!activeTabState.current) {
      return [];
    }

    const { whereClause, params } = buildSearchQuery(editorState.searchFilters);
    return queryCardsRaw(activeTabState.current.id, `${whereClause} ORDER BY datas.id`, params);
  }

  async function handleCreateFilteredCdb() {
    const sourceCdbPath = activeTabState.current?.path ?? '';
    if (!sourceCdbPath) {
      showToast(t('editor.package_zip_no_cdb'), 'info');
      return;
    }

    state.isCreatingFilteredCdb = true;

    try {
      const filteredCards = await getCurrentFilteredCards();
      if (filteredCards.length === 0) {
        showToast(t('editor.create_filtered_cdb_empty'), 'info');
        return;
      }

      const outputPath = await tauriBridge.save({
        title: t('editor.create_filtered_cdb_title'),
        defaultPath: sourceCdbPath.replace(/\.cdb$/i, '-filtered.cdb'),
        filters: [{ name: 'YGOPro CDB Database', extensions: ['cdb'] }],
      });
      if (!outputPath || typeof outputPath !== 'string') {
        return;
      }
      if (!isNewOutputPath(outputPath, [sourceCdbPath, ...tabsState.current.map((tab) => tab.path)])) {
        showToast(t('editor.output_path_must_be_new'), 'error');
        return;
      }

      await createCdbFromCards(outputPath, filteredCards);
      const openedId = await openCdbPath(outputPath);
      if (openedId) {
        activateWorkspaceDocument(openedId);
      }

      if (state.copyFilteredAssets) {
        showToast(t('editor.create_filtered_cdb_copying_assets'), 'info');
        void copyCardAssets({
          sourceCdbPath,
          targetCdbPath: outputPath,
          cardIds: filteredCards.map((card) => card.code),
          includeImages: true,
          includeScripts: true,
        }).then(() => {
          showToast(t('editor.create_filtered_cdb_assets_copied'), 'success');
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
          showToast(t('editor.create_filtered_cdb_assets_failed'), 'error');
        });
      }

      state.isCreateFilteredCdbOpen = false;
      showToast(
        t('editor.create_filtered_cdb_success', {
          values: { count: String(filteredCards.length) },
        }),
        'success',
      );
    } catch (error) {
      console.error('Failed to create filtered cdb', error);
      void writeErrorLog({
        source: 'shell.create-filtered-cdb',
        error,
        extra: { sourceCdbPath },
      });
      showToast(t('editor.create_filtered_cdb_failed'), 'error');
    } finally {
      state.isCreatingFilteredCdb = false;
    }
  }

  function resetMergeDialogState() {
    state.mergePathA = activeTabState.current?.path ?? '';
    state.mergePathB = '';
    state.mergeConflictMode = 'preferA';
    state.mergeIncludeImages = true;
    state.mergeIncludeScripts = true;
    state.mergeAnalysis = null;
    state.mergeAnalysisKey = '';
    state.manualMergeChoices = {};
  }

  function openMergeCdbDialog() {
    resetMergeDialogState();
    state.isMergeCdbOpen = true;
  }

  function closeMergeCdbDialog() {
    if (state.isAnalyzingMerge || state.isMergingCdb) return;
    state.isMergeCdbOpen = false;
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
      state.mergePathA = selected;
    } else {
      state.mergePathB = selected;
    }
    state.mergeAnalysis = null;
    state.mergeAnalysisKey = '';
    state.manualMergeChoices = {};
  }

  async function handleAnalyzeMerge() {
    if (!state.mergePathA.trim() || !state.mergePathB.trim()) {
      showToast(t('editor.merge_cdb_pick_both'), 'info');
      return;
    }
    if (state.mergePathA === state.mergePathB) {
      showToast(t('editor.merge_cdb_same_source'), 'error');
      return;
    }

    state.isAnalyzingMerge = true;
    try {
      const analysis = await analyzeCdbMerge(state.mergePathA, state.mergePathB);
      state.mergeAnalysis = analysis;
      state.mergeAnalysisKey = buildMergeAnalysisKey(state.mergePathA, state.mergePathB);
      state.manualMergeChoices = Object.fromEntries(
        analysis.conflicts.map((conflict) => [conflict.code, 'a' as const]),
      );
    } catch (error) {
      console.error('Failed to analyze cdb merge', error);
      void writeErrorLog({
        source: 'shell.merge-cdb.analyze',
        error,
        extra: { mergePathA: state.mergePathA, mergePathB: state.mergePathB },
      });
      showToast(t('editor.merge_cdb_analyze_failed'), 'error');
    } finally {
      state.isAnalyzingMerge = false;
    }
  }

  async function handleExecuteMerge() {
    if (!state.mergeAnalysis || state.mergeAnalysisKey !== buildMergeAnalysisKey(state.mergePathA, state.mergePathB)) {
      await handleAnalyzeMerge();
      if (!state.mergeAnalysis) {
        return;
      }
    }

    const outputPath = await tauriBridge.save({
      title: t('editor.merge_cdb_title'),
      defaultPath: `merged-${basename(state.mergePathA).replace(/\.cdb$/i, '')}-${basename(state.mergePathB)}`,
      filters: [{ name: 'YGOPro CDB Database', extensions: ['cdb'] }],
    });
    if (!outputPath || typeof outputPath !== 'string') {
      return;
    }
    if (
      !isNewOutputPath(outputPath, [
        state.mergePathA,
        state.mergePathB,
        ...tabsState.current.map((tab) => tab.path),
      ])
    ) {
      showToast(t('editor.output_path_must_be_new'), 'error');
      return;
    }

    state.isMergingCdb = true;
    try {
      await executeCdbMerge({
        aPath: state.mergePathA,
        bPath: state.mergePathB,
        outputPath,
        conflictMode: state.mergeConflictMode,
        manualChoices: state.manualMergeChoices,
        includeImages: state.mergeIncludeImages,
        includeScripts: state.mergeIncludeScripts,
      });
      const openedId = await openCdbPath(outputPath);
      if (openedId) {
        activateWorkspaceDocument(openedId);
      }
      state.isMergeCdbOpen = false;
      showToast(t('editor.merge_cdb_success'), 'success');
    } catch (error) {
      console.error('Failed to merge cdb', error);
      void writeErrorLog({
        source: 'shell.merge-cdb.execute',
        error,
        extra: {
          mergePathA: state.mergePathA,
          mergePathB: state.mergePathB,
          outputPath,
          mergeConflictMode: state.mergeConflictMode,
          mergeIncludeImages: state.mergeIncludeImages,
          mergeIncludeScripts: state.mergeIncludeScripts,
        },
      });
      showToast(t('editor.merge_cdb_failed'), 'error');
    } finally {
      state.isMergingCdb = false;
    }
  }

  async function ensureCurrentContextSavedForPackaging(targetCdbPath: string) {
    const activeScriptWorkspace = activeScriptTabState.current
      ? workspaceState.documents.find((document) => document.id === activeScriptTabState.current?.id) ?? null
      : null;

    if (
      appShellState.mainView === 'script'
      && activeScriptTabState.current?.cdbPath === targetCdbPath
      && activeScriptWorkspace?.dirty
    ) {
      const confirmed = await tauriBridge.ask(t('editor.package_zip_unsaved_script_confirm'), {
        title: t('editor.package_zip_unsaved_title'),
        kind: 'warning',
      });
      if (!confirmed) return false;

      const ok = await saveWorkspaceDocument(activeScriptWorkspace.id);
      if (!ok) {
        showToast(t('editor.script_save_failed'), 'error');
        return false;
      }
    }

    const sourceWorkspace = workspaceState.documents.find(
      (document) => document.kind === 'db' && document.source.path === targetCdbPath,
    ) ?? null;

    if (sourceWorkspace?.dirty) {
      const confirmed = await tauriBridge.ask(
        t('editor.package_zip_unsaved_cdb_confirm', {
          values: { name: sourceWorkspace.title },
        }),
        {
          title: t('editor.package_zip_unsaved_title'),
          kind: 'warning',
        },
      );
      if (!confirmed) return false;

      const ok = await saveWorkspaceDocument(sourceWorkspace.id);
      if (!ok) {
        showToast(t('editor.save_failed'), 'error');
        return false;
      }
    }

    return true;
  }

  async function handlePackageZip() {
    return handlePackageAs('zip');
  }

  async function handlePackageYpk() {
    return handlePackageAs('ypk');
  }

  function showPackageMenu() {
    state.isPackageMenuVisible = true;
  }

  function hidePackageMenu() {
    state.isPackageMenuVisible = false;
  }

  async function handlePackageAs(format: 'zip' | 'ypk') {
    const cdbPath = getCurrentPackageCdbPath();
    if (!cdbPath) {
      showToast(t('editor.package_zip_no_cdb'), 'info');
      return;
    }

    if (!(await ensureCurrentContextSavedForPackaging(cdbPath))) {
      return;
    }

    const outputPath = await tauriBridge.save({
      defaultPath: cdbPath.replace(/\.cdb$/i, `.${format}`),
      filters: [{ name: format.toUpperCase(), extensions: [format] }],
    });
    if (!outputPath) {
      return;
    }

    try {
      const result = await packageCdbAssetsAsZip(cdbPath, outputPath);
      showToast(
        t(
          format === 'zip' ? 'editor.package_zip_success' : 'editor.package_ypk_success',
          { values: { path: result.path } },
        ),
        'success',
        3200,
      );
    } catch (error) {
      console.error(`Failed to package cdb assets as ${format}`, error);
      void writeErrorLog({
        source: format === 'zip' ? 'shell.package-cdb-assets-as-zip' : 'shell.package-cdb-assets-as-ypk',
        error,
        extra: { cdbPath, outputPath },
      });
      showToast(
        t(format === 'zip' ? 'editor.package_zip_failed' : 'editor.package_ypk_failed'),
        'error',
      );
    }
  }

  return {
    state,
    getCurrentPackageCdbPath,
    openCreateFilteredCdbDialog,
    closeCreateFilteredCdbDialog,
    handleCreateFilteredCdb,
    openMergeCdbDialog,
    closeMergeCdbDialog,
    pickMergePath,
    handleAnalyzeMerge,
    handleExecuteMerge,
    handlePackageZip,
    handlePackageYpk,
    showPackageMenu,
    hidePackageMenu,
  };
}
