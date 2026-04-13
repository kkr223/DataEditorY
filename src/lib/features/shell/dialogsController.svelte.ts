import { get, fromStore } from 'svelte/store';
import { _ } from 'svelte-i18n';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { tauriBridge } from '$lib/infrastructure/tauri';
import {
  analyzeCdbMerge,
  collectMergeSourcesFromFolder,
  copyCardAssets,
  createCdbFromCards,
  executeCdbMerge,
  packageCdbAssetsAsZip,
  type AnalyzeCdbMergeResponse,
  type BackgroundTaskProgressEvent,
  type MergeSourceItem,
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
    mergeSources: [] as MergeSourceItem[],
    mergeIncludeImages: true,
    mergeIncludeScripts: true,
    isCollectingMergeSources: false,
    isAnalyzingMerge: false,
    isMergingCdb: false,
    isPackageMenuVisible: false,
    mergeAnalysis: null as AnalyzeCdbMergeResponse | null,
    mergeAnalysisKey: '',
    backgroundTask: {
      task: null as 'package' | 'merge' | null,
      format: null as 'zip' | 'ypk' | null,
      stage: '',
      current: 0,
      total: 0,
    },
  });

  let baseWindowTitle = 'DataEditorY Extra';

  function getTaskTitle() {
    if (!state.backgroundTask.task) {
      return baseWindowTitle;
    }

    const label = state.backgroundTask.task === 'merge'
      ? t('editor.background_merge_running')
      : t(
          state.backgroundTask.format === 'ypk'
            ? 'editor.background_package_ypk_running'
            : 'editor.background_package_zip_running',
        );
    const { current, total } = state.backgroundTask;

    if (total > 0) {
      return `${baseWindowTitle}（${label}-${current}/${total}）`;
    }

    return `${baseWindowTitle}（${label}）`;
  }

  async function applyWindowTitle() {
    const nextTitle = getTaskTitle();
    document.title = nextTitle;

    if (!tauriBridge.isTauri()) {
      return;
    }

    try {
      await getCurrentWindow().setTitle(nextTitle);
    } catch (error) {
      console.warn('Failed to set window title', error);
    }
  }

  function setBackgroundTask(input: {
    task: 'package' | 'merge';
    format?: 'zip' | 'ypk';
    stage?: string;
    current?: number;
    total?: number;
  }) {
    state.backgroundTask.task = input.task;
    state.backgroundTask.format = input.format ?? null;
    state.backgroundTask.stage = input.stage ?? '';
    state.backgroundTask.current = input.current ?? 0;
    state.backgroundTask.total = input.total ?? 0;
    void applyWindowTitle();
  }

  function clearBackgroundTask() {
    state.backgroundTask.task = null;
    state.backgroundTask.format = null;
    state.backgroundTask.stage = '';
    state.backgroundTask.current = 0;
    state.backgroundTask.total = 0;
    void applyWindowTitle();
  }

  function hasRunningBackgroundTask() {
    return state.backgroundTask.task !== null;
  }

  function isMergeTaskRunning() {
    return state.backgroundTask.task === 'merge';
  }

  function isPackageTaskRunning() {
    return state.backgroundTask.task === 'package';
  }

  function ensureNoRunningBackgroundTask() {
    if (!hasRunningBackgroundTask()) {
      return true;
    }

    showToast(t('editor.background_task_busy'), 'info');
    return false;
  }

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
    state.mergeSources = activeTabState.current?.path
      ? [{
          path: activeTabState.current.path,
          name: basename(activeTabState.current.path),
          projectDir: activeTabState.current.path.replace(/[\\/][^\\/]+$/, ''),
          cardTotal: undefined,
        }]
      : [];
    state.mergeIncludeImages = true;
    state.mergeIncludeScripts = true;
    state.isCollectingMergeSources = false;
    state.mergeAnalysis = null;
    state.mergeAnalysisKey = '';
  }

  function openMergeCdbDialog() {
    if (!ensureNoRunningBackgroundTask()) {
      return;
    }
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

  function invalidateMergeAnalysis() {
    state.mergeAnalysis = null;
    state.mergeAnalysisKey = '';
  }

  function upsertMergeSources(items: MergeSourceItem[]) {
    const existingPaths = new Set(state.mergeSources.map((item) => item.path));
    const nextItems = items.filter((item) => !existingPaths.has(item.path));
    if (nextItems.length === 0) {
      return;
    }
    state.mergeSources = [...state.mergeSources, ...nextItems];
    invalidateMergeAnalysis();
  }

  async function pickMergeFiles() {
    const selected = await tauriBridge.open({
      multiple: true,
      filters: [{ name: 'YGOPro CDB Database', extensions: ['cdb'] }],
    });
    if (!selected) {
      return;
    }

    const paths = Array.isArray(selected) ? selected.filter((item): item is string => typeof item === 'string') : [selected];
    upsertMergeSources(paths.map((path) => ({
      path,
      name: basename(path),
      projectDir: path.replace(/[\\/][^\\/]+$/, ''),
      cardTotal: undefined,
    })));
  }

  async function pickMergeFolder() {
    const selected = await tauriBridge.open({
      directory: true,
      multiple: false,
    });
    if (!selected || typeof selected !== 'string') {
      return;
    }

    state.isCollectingMergeSources = true;
    try {
      const collected = await collectMergeSourcesFromFolder(selected);
      if (collected.length === 0) {
        showToast(t('editor.merge_cdb_folder_empty'), 'info');
        return;
      }
      upsertMergeSources(collected);
    } catch (error) {
      console.error('Failed to collect merge sources from folder', error);
      void writeErrorLog({
        source: 'shell.merge-cdb.collect-folder',
        error,
        extra: { directoryPath: selected },
      });
      showToast(t('editor.merge_cdb_collect_failed'), 'error');
    } finally {
      state.isCollectingMergeSources = false;
    }
  }

  function removeMergeSource(path: string) {
    state.mergeSources = state.mergeSources.filter((item) => item.path !== path);
    invalidateMergeAnalysis();
  }

  function moveMergeSource(path: string, direction: -1 | 1) {
    const index = state.mergeSources.findIndex((item) => item.path === path);
    if (index < 0) return;
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= state.mergeSources.length) return;

    const next = [...state.mergeSources];
    const [item] = next.splice(index, 1);
    next.splice(targetIndex, 0, item);
    state.mergeSources = next;
    invalidateMergeAnalysis();
  }

  function reorderMergeSource(draggedPath: string, targetPath: string) {
    if (!draggedPath || !targetPath || draggedPath === targetPath) return;

    const fromIndex = state.mergeSources.findIndex((item) => item.path === draggedPath);
    const toIndex = state.mergeSources.findIndex((item) => item.path === targetPath);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;

    const next = [...state.mergeSources];
    const [draggedItem] = next.splice(fromIndex, 1);
    const insertIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
    next.splice(insertIndex, 0, draggedItem);
    state.mergeSources = next;
    invalidateMergeAnalysis();
  }

  function setMergeIncludeImages(value: boolean) {
    state.mergeIncludeImages = value;
    invalidateMergeAnalysis();
  }

  function setMergeIncludeScripts(value: boolean) {
    state.mergeIncludeScripts = value;
    invalidateMergeAnalysis();
  }

  async function handleAnalyzeMerge() {
    if (state.mergeSources.length === 0) {
      showToast(t('editor.merge_cdb_pick_sources'), 'info');
      return;
    }

    state.isAnalyzingMerge = true;
    try {
      const sourcePaths = state.mergeSources.map((item) => item.path);
      const analysis = await analyzeCdbMerge(
        sourcePaths,
        state.mergeIncludeImages,
        state.mergeIncludeScripts,
      );
      state.mergeAnalysis = analysis;
      state.mergeAnalysisKey = buildMergeAnalysisKey(
        sourcePaths,
        state.mergeIncludeImages,
        state.mergeIncludeScripts,
      );
      const cardTotalsByPath = new Map(analysis.sources.map((item) => [item.path, item.cardTotal]));
      state.mergeSources = state.mergeSources.map((item) => ({
        ...item,
        cardTotal: cardTotalsByPath.get(item.path) ?? item.cardTotal,
      }));
    } catch (error) {
      console.error('Failed to analyze cdb merge', error);
      void writeErrorLog({
        source: 'shell.merge-cdb.analyze',
        error,
        extra: {
          sourcePaths: state.mergeSources.map((item) => item.path),
          includeImages: state.mergeIncludeImages,
          includeScripts: state.mergeIncludeScripts,
        },
      });
      showToast(t('editor.merge_cdb_analyze_failed'), 'error');
    } finally {
      state.isAnalyzingMerge = false;
    }
  }

  async function handleExecuteMerge() {
    if (!ensureNoRunningBackgroundTask()) {
      return;
    }

    const sourcePaths = state.mergeSources.map((item) => item.path);
    if (
      !state.mergeAnalysis
      || state.mergeAnalysisKey !== buildMergeAnalysisKey(
        sourcePaths,
        state.mergeIncludeImages,
        state.mergeIncludeScripts,
      )
    ) {
      await handleAnalyzeMerge();
      if (!state.mergeAnalysis) {
        return;
      }
    }

    const outputDir = await tauriBridge.open({
      directory: true,
      multiple: false,
    });
    if (!outputDir || typeof outputDir !== 'string') {
      return;
    }

    state.isMergingCdb = true;
    state.isMergeCdbOpen = false;
    setBackgroundTask({
      task: 'merge',
      stage: 'queued',
    });
    try {
      const result = await executeCdbMerge({
        sourcePaths,
        outputDir,
        includeImages: state.mergeIncludeImages,
        includeScripts: state.mergeIncludeScripts,
      });
      if (!isNewOutputPath(result.outputPath, tabsState.current.map((tab) => tab.path))) {
        showToast(t('editor.background_merge_completed'), 'success', 4200);
        state.isMergeCdbOpen = false;
        return;
      }
      const openedId = await openCdbPath(result.outputPath);
      if (openedId) {
        activateWorkspaceDocument(openedId);
      }
      state.isMergeCdbOpen = false;
      showToast(t('editor.background_merge_completed'), 'success', 4200);
    } catch (error) {
      console.error('Failed to merge cdb', error);
      void writeErrorLog({
        source: 'shell.merge-cdb.execute',
        error,
        extra: {
          sourcePaths,
          outputDir,
          mergeIncludeImages: state.mergeIncludeImages,
          mergeIncludeScripts: state.mergeIncludeScripts,
        },
      });
      showToast(t('editor.background_merge_failed'), 'error', 4200);
    } finally {
      state.isMergingCdb = false;
      clearBackgroundTask();
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
    if (!ensureNoRunningBackgroundTask()) {
      return;
    }

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

    setBackgroundTask({
      task: 'package',
      format,
      stage: 'queued',
    });
    try {
      const result = await packageCdbAssetsAsZip(cdbPath, outputPath);
      showToast(
        t(
          format === 'zip' ? 'editor.background_package_zip_completed' : 'editor.background_package_ypk_completed',
          { values: { path: result.path } },
        ),
        'success',
        4200,
      );
    } catch (error) {
      console.error(`Failed to package cdb assets as ${format}`, error);
      void writeErrorLog({
        source: format === 'zip' ? 'shell.package-cdb-assets-as-zip' : 'shell.package-cdb-assets-as-ypk',
        error,
        extra: { cdbPath, outputPath },
      });
      showToast(
        t(format === 'zip' ? 'editor.background_package_zip_failed' : 'editor.background_package_ypk_failed'),
        'error',
        4200,
      );
    } finally {
      clearBackgroundTask();
    }
  }

  function setup() {
    const unlisteners: Array<() => void> = [];
    baseWindowTitle = document.title || baseWindowTitle;

    if (tauriBridge.isTauri()) {
      void getCurrentWindow().title()
        .then((title) => {
          if (title?.trim()) {
            baseWindowTitle = title;
            void applyWindowTitle();
          }
        })
        .catch((error) => {
          console.warn('Failed to read window title', error);
        });

      void tauriBridge.listen<BackgroundTaskProgressEvent>('background-task-progress', (event) => {
        const payload = event.payload;
        if (!payload) {
          return;
        }

        setBackgroundTask({
          task: payload.task,
          format: state.backgroundTask.format ?? undefined,
          stage: payload.stage,
          current: payload.current,
          total: payload.total,
        });
      }).then((unlisten) => {
        unlisteners.push(unlisten);
      });
    } else {
      void applyWindowTitle();
    }

    return () => {
      for (const unlisten of unlisteners) {
        unlisten();
      }
      clearBackgroundTask();
    };
  }

  return {
    state,
    setup,
    isMergeTaskRunning,
    isPackageTaskRunning,
    getCurrentPackageCdbPath,
    openCreateFilteredCdbDialog,
    closeCreateFilteredCdbDialog,
    handleCreateFilteredCdb,
    openMergeCdbDialog,
    closeMergeCdbDialog,
    pickMergeFiles,
    pickMergeFolder,
    removeMergeSource,
    moveMergeSource,
    reorderMergeSource,
    setMergeIncludeImages,
    setMergeIncludeScripts,
    handleAnalyzeMerge,
    handleExecuteMerge,
    handlePackageZip,
    handlePackageYpk,
    showPackageMenu,
    hidePackageMenu,
  };
}
