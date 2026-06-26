import { tauriBridge } from '$lib/infrastructure/tauri';
import {
  analyzeCdbMerge,
  collectMergeSourcesFromFolder,
  executeCdbMerge,
  packageCdbAssetsAsZip,
  type BackgroundTaskProgressEvent,
} from '$lib/infrastructure/tauri/commands';
import { documentRuntime } from '$lib/platform/appRuntime';
import { applyBatchOperations } from './cdbApi';
import { checkAssets } from './assetApi';
import {
  applyLuaReplace,
  previewLuaReplace,
  type LuaReplaceRequest,
} from './scriptApi';
export type CoreTaskKind =
  | 'package.zip'
  | 'merge.analyze'
  | 'merge.execute'
  | 'merge.collect-sources'
  | 'batch.cdb.apply'
  | 'lua.replace.preview'
  | 'lua.replace.apply'
  | 'asset.check';

export type TaskKind = CoreTaskKind | (string & {});

export type TaskStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export type TaskRecord = {
  id: string;
  kind: TaskKind;
  status: TaskStatus;
  startedAt: number;
  completedAt?: number;
  error?: string;
};

export type CoreStartTaskRequest =
  | { kind: 'package.zip'; cdbPath: string; outputPath: string }
  | { kind: 'merge.collect-sources'; directoryPath: string }
  | { kind: 'merge.analyze'; sourcePaths: string[]; includeImages: boolean; includeScripts: boolean }
  | {
      kind: 'merge.execute';
      sourcePaths: string[];
      outputDir: string;
      includeImages: boolean;
      includeScripts: boolean;
    }
  | { kind: 'batch.cdb.apply'; sessionId: string; previewId: string }
  | { kind: 'lua.replace.preview'; request: LuaReplaceRequest }
  | { kind: 'lua.replace.apply'; request: LuaReplaceRequest }
  | { kind: 'asset.check'; cdbPath: string; cardIds: number[] };

export type StartTaskRequest = CoreStartTaskRequest | {
  kind: string;
  [key: string]: unknown;
};

const taskRecords = new Map<string, TaskRecord>();
const taskCancellationHandlers = new Map<string, () => boolean | Promise<boolean>>();
const CORE_TASK_KINDS = new Set<string>([
  'package.zip',
  'merge.collect-sources',
  'merge.analyze',
  'merge.execute',
  'batch.cdb.apply',
  'lua.replace.preview',
  'lua.replace.apply',
  'asset.check',
]);

const isCoreTaskRequest = (request: StartTaskRequest): request is CoreStartTaskRequest => (
  CORE_TASK_KINDS.has(request.kind)
);

function createTaskId(kind: TaskKind) {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${kind}:${random}`;
}

function setTaskRecord(record: TaskRecord) {
  taskRecords.set(record.id, record);
  return record;
}

async function runTask(request: StartTaskRequest, taskId: string) {
  const extensionRunner = documentRuntime.registry.taskRunners.get(request.kind);
  if (extensionRunner) {
    if (extensionRunner.cancel) {
      taskCancellationHandlers.set(taskId, () => extensionRunner.cancel!(taskId));
    }
    return extensionRunner.run(request, { taskId });
  }
  if (!isCoreTaskRequest(request)) {
    throw new Error(`No task runner registered for ${request.kind}`);
  }

  switch (request.kind) {
    case 'package.zip':
      return packageCdbAssetsAsZip(request.cdbPath, request.outputPath);
    case 'merge.collect-sources':
      return collectMergeSourcesFromFolder(request.directoryPath);
    case 'merge.analyze':
      return analyzeCdbMerge(request.sourcePaths, request.includeImages, request.includeScripts);
    case 'merge.execute':
      return executeCdbMerge(request);
    case 'batch.cdb.apply':
      return applyBatchOperations(request.sessionId, request.previewId);
    case 'lua.replace.preview':
      return previewLuaReplace(request.request);
    case 'lua.replace.apply':
      return applyLuaReplace(request.request);
    case 'asset.check':
      return checkAssets(request.cdbPath, request.cardIds);
  }
}

export async function startTask(request: StartTaskRequest, options: { taskId?: string } = {}) {
  const taskId = options.taskId ?? createTaskId(request.kind);
  setTaskRecord({
    id: taskId,
    kind: request.kind,
    status: 'running',
    startedAt: Date.now(),
  });

  try {
    const result = await runTask(request, taskId);
    const current = taskRecords.get(taskId);
    setTaskRecord({
      ...(current ?? { id: taskId, kind: request.kind, startedAt: Date.now() }),
      status: current?.status === 'cancelled' ? 'cancelled' : 'completed',
      completedAt: Date.now(),
    });
    return result;
  } catch (error) {
    const current = taskRecords.get(taskId);
    setTaskRecord({
      ...(current ?? { id: taskId, kind: request.kind, startedAt: Date.now() }),
      status: current?.status === 'cancelled' ? 'cancelled' : 'failed',
      completedAt: Date.now(),
      ...(current?.status === 'cancelled'
        ? {}
        : { error: error instanceof Error ? error.message : String(error) }),
    });
    throw error;
  } finally {
    taskCancellationHandlers.delete(taskId);
  }
}

export function getTask(taskId: string) {
  return taskRecords.get(taskId) ?? null;
}

export async function cancelTask(taskId: string) {
  const current = taskRecords.get(taskId);
  if (!current || current.status !== 'running') {
    return false;
  }

  const cancel = taskCancellationHandlers.get(taskId);
  if (!cancel || !(await cancel())) {
    return false;
  }

  setTaskRecord({
    ...current,
    status: 'cancelled',
    completedAt: Date.now(),
  });
  return true;
}

export function onTaskProgress(listener: (event: BackgroundTaskProgressEvent) => void) {
  return tauriBridge.listen<BackgroundTaskProgressEvent>('background-task-progress', (event) => {
    listener(event.payload);
  });
}
