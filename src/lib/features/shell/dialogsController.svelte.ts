import { get, fromStore } from 'svelte/store';
import { _ } from 'svelte-i18n';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { tauriBridge } from '$lib/infrastructure/tauri';
import {
  type BackgroundTaskProgressEvent,
  type MergeSourceItem,
  type AnalyzeCdbMergeResponse,
} from '$lib/infrastructure/tauri/commands';
import { activeTab } from '$lib/stores/db';
import { showToast } from '$lib/stores/toast.svelte';
import { createFilterCdbController } from '$lib/features/shell/filterCdbController';
import { createMergeController } from '$lib/features/shell/mergeController';
import { createPackageController } from '$lib/features/shell/packageController';

const activeTabState = fromStore(activeTab);

function t(key: string, options?: Record<string, unknown>) {
  return String(get(_)(key, options as never));
}

type BackgroundTaskKind = 'package' | 'merge';
type BackgroundTaskFormat = 'zip' | 'ypk' | null;
type BackgroundTaskQueueItem = {
  id: number;
  task: BackgroundTaskKind;
  format: BackgroundTaskFormat;
};
type PendingBackgroundTask = BackgroundTaskQueueItem & {
  run: () => Promise<void>;
};
export const shellBackgroundTaskState = $state({
  task: null as BackgroundTaskKind | null,
  format: null as BackgroundTaskFormat,
  stage: '',
  current: 0,
  total: 0,
  queue: [] as BackgroundTaskQueueItem[],
});

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
  });

  let baseWindowTitle = 'DataEditorY Extra';
  let nextBackgroundTaskId = 1;
  const pendingBackgroundTasks: PendingBackgroundTask[] = [];
  let isProcessingBackgroundTasks = false;
  function getBackgroundTaskLabel(task: BackgroundTaskKind | null, format: BackgroundTaskFormat) {
    if (!task) {
      return '';
    }

    return task === 'merge'
      ? t('editor.background_merge_running')
      : t(
          format === 'ypk'
            ? 'editor.background_package_ypk_running'
            : 'editor.background_package_zip_running',
        );
  }
  function getTaskTitle() {
    if (!shellBackgroundTaskState.task) {
      return baseWindowTitle;
    }

    const label = getBackgroundTaskLabel(shellBackgroundTaskState.task, shellBackgroundTaskState.format);
    const { current, total } = shellBackgroundTaskState;
    const queueSuffix = shellBackgroundTaskState.queue.length > 0
      ? ` +${shellBackgroundTaskState.queue.length}`
      : '';

    if (total > 0) {
      return `${baseWindowTitle}（${label}-${current}/${total}${queueSuffix}）`;
    }

    return `${baseWindowTitle}（${label}${queueSuffix}）`;
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
    task: BackgroundTaskKind;
    format?: 'zip' | 'ypk';
    stage?: string;
    current?: number;
    total?: number;
  }) {
    shellBackgroundTaskState.task = input.task;
    shellBackgroundTaskState.format = input.format ?? null;
    shellBackgroundTaskState.stage = input.stage ?? '';
    shellBackgroundTaskState.current = input.current ?? 0;
    shellBackgroundTaskState.total = input.total ?? 0;
    void applyWindowTitle();
  }
  function clearBackgroundTask() {
    shellBackgroundTaskState.task = null;
    shellBackgroundTaskState.format = null;
    shellBackgroundTaskState.stage = '';
    shellBackgroundTaskState.current = 0;
    shellBackgroundTaskState.total = 0;
    void applyWindowTitle();
  }
  const hasRunningBackgroundTask = () => shellBackgroundTaskState.task !== null;
  const isMergeTaskRunning = () => shellBackgroundTaskState.task === 'merge';
  const isPackageTaskRunning = () => shellBackgroundTaskState.task === 'package';
  function removeQueuedBackgroundTask(id: number) {
    const nextQueue = shellBackgroundTaskState.queue.filter((item) => item.id !== id);
    if (nextQueue.length === shellBackgroundTaskState.queue.length) {
      return;
    }

    shellBackgroundTaskState.queue = nextQueue;
    void applyWindowTitle();
  }
  async function processBackgroundTaskQueue() {
    if (isProcessingBackgroundTasks) {
      return;
    }

    isProcessingBackgroundTasks = true;
    try {
      while (pendingBackgroundTasks.length > 0) {
        const nextTask = pendingBackgroundTasks.shift();
        if (!nextTask) {
          continue;
        }

        removeQueuedBackgroundTask(nextTask.id);
        setBackgroundTask({
          task: nextTask.task,
          format: nextTask.format ?? undefined,
          stage: 'queued',
        });

        try {
          await nextTask.run();
        } finally {
          clearBackgroundTask();
        }
      }
    } finally {
      isProcessingBackgroundTasks = false;
    }
  }
  function enqueueBackgroundTask(input: {
    task: BackgroundTaskKind;
    format?: 'zip' | 'ypk';
    run: () => Promise<void>;
  }) {
    const taskId = nextBackgroundTaskId++;
    const queuedTask: PendingBackgroundTask = {
      id: taskId,
      task: input.task,
      format: input.format ?? null,
      run: input.run,
    };
    const willQueue = hasRunningBackgroundTask() || pendingBackgroundTasks.length > 0 || isProcessingBackgroundTasks;

    pendingBackgroundTasks.push(queuedTask);

    if (willQueue) {
      shellBackgroundTaskState.queue = [...shellBackgroundTaskState.queue, {
        id: queuedTask.id,
        task: queuedTask.task,
        format: queuedTask.format,
      }];
      showToast(
        t('editor.background_task_queued', {
          values: {
            label: getBackgroundTaskLabel(queuedTask.task, queuedTask.format),
          },
        }),
        'info',
        2600,
      );
      void applyWindowTitle();
    }

    void processBackgroundTaskQueue();
  }
  const mergeController = createMergeController(state, enqueueBackgroundTask);
  const filterCdbController = createFilterCdbController(state);
  const packageController = createPackageController(state, enqueueBackgroundTask);
  function openCreateFilteredCdbDialog() {
    if (!activeTabState.current?.path) {
      showToast(t('editor.package_zip_no_cdb'), 'info');
      return;
    }

    state.copyFilteredAssets = true;
    state.isCreateFilteredCdbOpen = true;
  }
  function closeCreateFilteredCdbDialog() {
    if (state.isCreatingFilteredCdb) return;
    state.isCreateFilteredCdbOpen = false;
  }
  function openMergeCdbDialog() {
    mergeController.resetMergeDialogState();
    state.isMergeCdbOpen = true;
  }
  function closeMergeCdbDialog() {
    if (state.isAnalyzingMerge || state.isMergingCdb) return;
    state.isMergeCdbOpen = false;
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
          format: shellBackgroundTaskState.format ?? undefined,
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
      pendingBackgroundTasks.length = 0;
      shellBackgroundTaskState.queue = [];
      clearBackgroundTask();
    };
  }
  return {
    state,
    setup,
    isMergeTaskRunning,
    isPackageTaskRunning,
    getCurrentPackageCdbPath: packageController.getCurrentPackageCdbPath,
    openCreateFilteredCdbDialog,
    closeCreateFilteredCdbDialog,
    handleCreateFilteredCdb: filterCdbController.handleCreateFilteredCdb,
    openMergeCdbDialog,
    closeMergeCdbDialog,
    pickMergeFiles: mergeController.pickMergeFiles,
    pickMergeFolder: mergeController.pickMergeFolder,
    removeMergeSource: mergeController.removeMergeSource,
    moveMergeSource: mergeController.moveMergeSource,
    reorderMergeSource: mergeController.reorderMergeSource,
    setMergeIncludeImages: mergeController.setMergeIncludeImages,
    setMergeIncludeScripts: mergeController.setMergeIncludeScripts,
    handleAnalyzeMerge: mergeController.handleAnalyzeMerge,
    handleExecuteMerge: mergeController.handleExecuteMerge,
    handlePackageZip: packageController.handlePackageZip,
    handlePackageYpk: packageController.handlePackageYpk,
    showPackageMenu: packageController.showPackageMenu,
    hidePackageMenu: packageController.hidePackageMenu,
  };
}
