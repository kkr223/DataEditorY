import { documentRuntime } from '$lib/platform/appRuntime';
import type { CardCollectionQuery } from '$lib/modules/card/types';
import type { WorkspaceSearchRequest, WorkspaceSearchResult } from '$lib/features/workspace-search/types';

export const searchWorkspace = (sessionId: string, request: WorkspaceSearchRequest) => (
  documentRuntime.query<WorkspaceSearchResult>(sessionId, {
    kind: 'workspaceSearch', request,
  } satisfies CardCollectionQuery)
);
