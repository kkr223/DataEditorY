import { tick } from 'svelte';
import { get } from 'svelte/store';
import { _ } from 'svelte-i18n';
import { activeTab, getCardByIdInTab } from '$lib/stores/db';
import { editorState, getAllCardsMap, handleSearch, setSingleSelectedCard } from '$lib/stores/editor.svelte';
import { DEFAULT_SEARCH_FILTERS } from '$lib/types';
import { commitWorkspaceCardDraft } from '$lib/modules/card/workbench/cardDraftWorkspaceState.svelte';
import { activateCardSurface, type CardSurfaceId } from '$lib/modules/card/workbench/surfaceState.svelte';
import { activateEditorView } from '$lib/stores/appShell.svelte';
import { openCardScriptWorkspace } from '$lib/services/cardScriptService';
import { showToast } from '$lib/stores/toast.svelte';

export async function navigateToCard(tabId: string, cardId: number, surface: CardSurfaceId) {
  const tab = get(activeTab);
  if (!tab || tab.id !== tabId || !(await commitWorkspaceCardDraft(tabId))) return;
  const card = await getCardByIdInTab(tabId, cardId);
  if (get(activeTab)?.id !== tabId) return;
  if (!card) { showToast(String(get(_)('context_menu.card_missing')), 'error'); return; }
  if (!getAllCardsMap().has(cardId)) {
    editorState.searchFilters = { ...DEFAULT_SEARCH_FILTERS, id: String(cardId) };
    if (!(await handleSearch(false, true)) || get(activeTab)?.id !== tabId) return;
  }
  setSingleSelectedCard(cardId);
  await tick();
  if (get(activeTab)?.id !== tabId) return;
  if (surface === 'script') {
    const result = await openCardScriptWorkspace({ cdbPath: tab.path, sourceTabId: tabId, cardCode: cardId, cardName: card.name, activate: false });
    if (!result || get(activeTab)?.id !== tabId) return;
    const { activateScriptTab } = await import('$lib/stores/scriptEditor.svelte');
    await activateScriptTab(result.tabId, undefined, () => get(activeTab)?.id === tabId);
  } else activateEditorView();
  if (get(activeTab)?.id === tabId) activateCardSurface(surface);
}
