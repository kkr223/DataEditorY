import { get } from 'svelte/store';
import { activeTab } from '$lib/stores/db';
import { getSelectedCard } from '$lib/stores/editor.svelte';
import { activeScriptTab, openExistingScriptTab } from '$lib/stores/scriptEditor.svelte';
import { navigateToCard } from '$lib/features/card-editor/cardNavigation';
import { scriptLocationRequest } from '$lib/features/script-editor/revealLocation';
import { clearScriptPair } from '$lib/features/script-editor/splitState';
import { activateCardSurface, cardSurfaceState } from '$lib/modules/card/workbench/surfaceState.svelte';
import type { WorkspaceSearchGroup, WorkspaceSearchMatch } from './types';

export const openWorkspaceSearchMatch = async (
  owner: { id: string; path: string }, group: WorkspaceSearchGroup, match: WorkspaceSearchMatch,
) => {
  await navigateToCard(owner.id, group.cardId, 'card');
  const current = () => get(activeTab)?.id === owner.id && get(activeTab)?.path === owner.path
    && getSelectedCard()?.code === group.cardId && cardSurfaceState.activeSurface === 'card';
  if (!group.path || !current()) return;
  const id = await openExistingScriptTab({
    cdbPath: owner.path, sourceTabId: owner.id, cardCode: group.cardId, cardName: group.cardName,
    scriptPath: group.path, activate: true, canActivate: current,
  });
  if (!id || !current() || get(activeScriptTab)?.id !== id) return;
  clearScriptPair(owner.id);
  scriptLocationRequest.set({ tabId: id, startLineNumber: match.line, endLineNumber: match.line,
    startColumn: match.column, endColumn: match.endColumn });
  activateCardSurface('script');
};
