import { get, fromStore } from 'svelte/store';
import { _ } from 'svelte-i18n';
import { tauriBridge } from '$lib/infrastructure/tauri';
import {
  analyzeCdbMerge,
  collectMergeSourcesFromFolder,
  executeCdbMerge,
  type AnalyzeCdbMergeResponse,
  type MergeSourceItem,
} from '$lib/infrastructure/tauri/commands';
import { activeTab, openCdbPath, tabs } from '$lib/stores/db';
import { showToast } from '$lib/stores/toast.svelte';
import { writeErrorLog } from '$lib/utils/errorLog';
import {
  buildMergeAnalysisKey,
  isNewOutputPath,
} from '$lib/features/shell/dialogsHelpers';
import { activateWorkspaceDocument } from '$lib/application/workspace/commandBus';

const activeTabState = fromStore(activeTab);
const tabsState = fromStore(tabs);

function t(key: string, options?: Record<string, unknown>) {
  return String(get(_)(key, options as never));
}

type MergeDialogState = {
  mergeSources: MergeSourceItem[];
  mergeIncludeImages: boolean;
  mergeIncludeScripts: boolean;
  isCollectingMergeSources: boolean;
  isAnalyzingMerge: boolean;
  isMergingCdb: boolean;
  mergeAnalysis: AnalyzeCdbMergeResponse | null;
  mergeAnalysisKey: string;
};

type EnqueueBackgroundTaskInput = {
  task: 'merge' | 'package';
  format?: 'zip' | 'ypk';
  run: () => Promise<void>;
};

function basename(path: string) {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] || path;
}

export function createMergeController(
  state: MergeDialogState,
  enqueueBackgroundTask: (input: EnqueueBackgroundTaskInput) => void,
) {
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

    const paths = Array.isArray(selected)
      ? selected.filter((item): item is string => typeof item === 'string')
      : [selected];

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

    const includeImages = state.mergeIncludeImages;
    const includeScripts = state.mergeIncludeScripts;
    state.isMergingCdb = true;
    try {
      enqueueBackgroundTask({
        task: 'merge',
        run: async () => {
          try {
            const result = await executeCdbMerge({
              sourcePaths,
              outputDir,
              includeImages,
              includeScripts,
            });
            if (!isNewOutputPath(result.outputPath, tabsState.current.map((tab) => tab.path))) {
              showToast(t('editor.background_merge_completed'), 'success', 4200);
              return;
            }

            const openedId = await openCdbPath(result.outputPath);
            if (openedId) {
              activateWorkspaceDocument(openedId);
            }
            showToast(t('editor.background_merge_completed'), 'success', 4200);
          } catch (error) {
            console.error('Failed to merge cdb', error);
            void writeErrorLog({
              source: 'shell.merge-cdb.execute',
              error,
              extra: {
                sourcePaths,
                outputDir,
                mergeIncludeImages: includeImages,
                mergeIncludeScripts: includeScripts,
              },
            });
            showToast(t('editor.background_merge_failed'), 'error', 4200);
          }
        },
      });
    } finally {
      state.isMergingCdb = false;
    }
  }

  return {
    resetMergeDialogState,
    invalidateMergeAnalysis,
    upsertMergeSources,
    pickMergeFiles,
    pickMergeFolder,
    removeMergeSource,
    moveMergeSource,
    reorderMergeSource,
    setMergeIncludeImages,
    setMergeIncludeScripts,
    handleAnalyzeMerge,
    handleExecuteMerge,
  };
}
