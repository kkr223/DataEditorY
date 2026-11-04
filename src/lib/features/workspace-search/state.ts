import { get } from 'svelte/store';
import { activeTab } from '#lib/stores/db.ts';
import { scriptTabs } from '#lib/stores/scriptEditor.svelte.ts';
import { documentRuntime } from '#lib/platform/appRuntime.ts';
import { isScriptTabOwnedByCdb } from '#lib/domain/script/tabIdentity.ts';
import { commitWorkspaceCardDraft } from '#lib/modules/card/workbench/cardDraftWorkspaceState.svelte.ts';
import { cardSurfaceState } from '#lib/modules/card/workbench/surfaceState.svelte.ts';
import { searchWorkspace } from '#lib/native/workspaceSearchApi.ts';
import { createWorkspaceSearchController } from './controller';

const sessions = new Map<string, { path: string; controller: ReturnType<typeof createWorkspaceSearchController> }>();

documentRuntime.subscribe(({ documents }) => {
  const live = new Set(documents.map((document) => document.id));
  for (const [id, entry] of sessions) {
    if (!live.has(id)) { entry.controller.cancel(); sessions.delete(id); }
  }
});

export const getWorkspaceSearchController = (tab: { id: string; path: string }) => {
  const previous = sessions.get(tab.id);
  if (previous?.path === tab.path) return previous.controller;
  previous?.controller.cancel();
  const controller = createWorkspaceSearchController({
    isCurrent: () => get(activeTab)?.id === tab.id && get(activeTab)?.path === tab.path && cardSurfaceState.activeSurface === 'search',
    commitDraft: () => commitWorkspaceCardDraft(tab.id),
    query: (request) => searchWorkspace(tab.id, request),
    getRevision: () => documentRuntime.getDocument(tab.id)?.revision ?? -1,
    getBuffers: () => get(scriptTabs)
      .filter((script) => script.cardCode > 0 && isScriptTabOwnedByCdb(script, { tabId: tab.id, path: tab.path }))
      .map((script) => ({ cardId: script.cardCode, content: script.content })),
  });
  sessions.set(tab.id, { path: tab.path, controller });
  return controller;
};
