import { documentRuntime } from '#lib/platform/appRuntime.ts';
import type { CardCollectionQuery } from '#lib/modules/card/types.ts';
import type { WorkspaceSearchRequest, WorkspaceSearchResult } from '#lib/features/workspace-search/types.ts';

export const searchWorkspace = (sessionId: string, request: WorkspaceSearchRequest) => (
  documentRuntime.query<WorkspaceSearchResult>(sessionId, {
    kind: 'workspaceSearch', request,
  } satisfies CardCollectionQuery)
);
