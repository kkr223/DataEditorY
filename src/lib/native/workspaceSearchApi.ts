import { documentRuntime } from '#lib/platform/appRuntime.ts';
import type { CardCollectionCommand, CardCollectionQuery } from '#lib/modules/card/types.ts';
import type { WorkspaceReplacePreview, WorkspaceReplaceRequest, WorkspaceSearchRequest, WorkspaceSearchResult } from '#lib/features/workspace-search/types.ts';

export const searchWorkspace = (sessionId: string, request: WorkspaceSearchRequest) => (
  documentRuntime.query<WorkspaceSearchResult>(sessionId, {
    kind: 'workspaceSearch', request,
  } satisfies CardCollectionQuery)
);

export const previewWorkspaceReplace = (sessionId: string, request: WorkspaceReplaceRequest) => (
  documentRuntime.query<WorkspaceReplacePreview>(sessionId, {
    kind: 'workspaceReplacePreview', request,
  } satisfies CardCollectionQuery)
);

export const commitWorkspaceReplaceCards = (sessionId: string, changes: WorkspaceReplacePreview['cards']) => (
  documentRuntime.execute(sessionId, {
    kind: 'upsert', cards: changes.map(change => change.after), expectedCards: changes.map(change => change.before),
  } satisfies CardCollectionCommand)
);
