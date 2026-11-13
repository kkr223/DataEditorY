import { host } from '#lib/platform/host/index.ts';
import type { BackgroundTaskProgressEvent } from '#lib/infrastructure/tauri/commands.ts';

export type {
  AnalyzeCdbMergeResponse,
  BackgroundTaskProgressEvent,
  MergeSourceItem,
} from '#lib/infrastructure/tauri/commands.ts';
import { documentRuntime } from '#lib/platform/appRuntime.ts';
import { applyBatchOperations } from './cdbApi';
import { checkAssets } from './assetApi';
import type { LuaReplaceRequest } from './scriptApi';
export type CoreStartTaskRequest =
  | { kind: 'package.zip'; cdbPath: string; outputPath: string }
  | { kind: 'merge.collect-sources'; directoryPath: string }
  | { kind: 'merge.analyze'; sourcePaths: string[]; includeImages: boolean; includeScripts: boolean }
  | {
      kind: 'merge.execute';
      sourcePaths: string[];
      outputDir?: string;
      outputPath?: string;
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

async function runTask(request: StartTaskRequest) {
  const extensionRunner = documentRuntime.registry.taskRunners.get(request.kind);
  if (extensionRunner) {
    return extensionRunner.run(request);
  }
  if (!isCoreTaskRequest(request)) {
    throw new Error(`No task runner registered for ${request.kind}`);
  }

  switch (request.kind) {
    case 'package.zip': {
      const commands = await import('#lib/infrastructure/tauri/commands.ts');
      return commands.packageCdbAssetsAsZip(request.cdbPath, request.outputPath);
    }
    case 'merge.collect-sources': {
      const commands = await import('#lib/infrastructure/tauri/commands.ts');
      return commands.collectMergeSourcesFromFolder(request.directoryPath);
    }
    case 'merge.analyze': {
      const commands = await import('#lib/infrastructure/tauri/commands.ts');
      return commands.analyzeCdbMerge(request.sourcePaths, request.includeImages, request.includeScripts);
    }
    case 'merge.execute': {
      const commands = await import('#lib/infrastructure/tauri/commands.ts');
      return commands.executeCdbMerge(request);
    }
    case 'batch.cdb.apply':
      return applyBatchOperations(request.sessionId, request.previewId);
    case 'lua.replace.preview': {
      const scriptApi = await import('./scriptApi.ts');
      return scriptApi.previewLuaReplace(request.request);
    }
    case 'lua.replace.apply': {
      const scriptApi = await import('./scriptApi.ts');
      return scriptApi.applyLuaReplace(request.request);
    }
    case 'asset.check':
      return checkAssets(request.cdbPath, request.cardIds);
  }
}

export function startTask(request: StartTaskRequest) {
  return runTask(request);
}

export function onTaskProgress(listener: (event: BackgroundTaskProgressEvent) => void) {
  return host.events.listen('background-task-progress', (payload) => {
    listener(payload as BackgroundTaskProgressEvent);
  });
}
