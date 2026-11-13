import { host } from '#lib/platform/host/index.ts';

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

export async function loadWorkspaceMetadata(cdbPath: string) {
  return await host.metadata.load(cdbPath) as WorkspaceMetadata;
}

export async function saveWorkspaceMetadata(
  cdbPath: string,
  metadata: WorkspaceMetadata,
  sourceCdbPath?: string,
) {
  return await host.metadata.save(cdbPath, metadata, sourceCdbPath) as WorkspaceMetadata;
}
