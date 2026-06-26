import { invokeCommand } from '$lib/infrastructure/tauri';

export type WorkspaceMetadata = {
  version: number;
  cdbPath: string;
  updatedAt?: string;
  ui?: Record<string, unknown>;
  cardGroups?: unknown[];
  image?: Record<string, unknown>;
  ai?: {
    activeThreadId?: string | null;
    threads?: unknown[];
    proposals?: unknown[];
  };
  scripts?: Record<string, unknown>;
  tasks?: {
    recent?: unknown[];
  };
  [key: string]: unknown;
};

export function loadWorkspaceMetadata(cdbPath: string) {
  return invokeCommand<WorkspaceMetadata>('load_workspace_metadata', { cdbPath });
}

export function saveWorkspaceMetadata(cdbPath: string, metadata: WorkspaceMetadata) {
  return invokeCommand<WorkspaceMetadata>('save_workspace_metadata', { cdbPath, metadata });
}

export function backupWorkspaceMetadata(cdbPath: string) {
  return invokeCommand<string | null>('backup_workspace_metadata', { cdbPath });
}
