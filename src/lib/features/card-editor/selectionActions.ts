import { get } from 'svelte/store';
import { _ } from 'svelte-i18n';
import { activeTabId, getCardsByIdsInTab, isDbLoaded, modifyCardsInTab, refreshSearchAfterMutation } from '$lib/stores/db';
import { getCardClipboard, hasCardClipboard, setCardClipboard } from '$lib/stores/cardClipboard.svelte';
import { clearSelection, editorState, getAllCardsMap, getSelectedCardIds, getSelectedCards, handleSearch, setSelectedCards } from '$lib/stores/editor.svelte';
import { showToast } from '$lib/stores/toast.svelte';
import { tauriBridge } from '$lib/infrastructure/tauri';
import { deleteDraftCardFlow } from '$lib/features/card-editor/useCases';
import { dispatchAppShortcut } from '$lib/utils/shortcuts';

export async function handleCopySelection() {
  const selectedCards = getSelectedCards();
  if (selectedCards.length === 0) {
    showToast(String(get(_)('editor.clipboard_empty')), 'info');
    return;
  }

  setCardClipboard(selectedCards);
  showToast(String(get(_)('editor.cards_copied', {
    values: { count: String(selectedCards.length) },
  } as never)), 'success');
}

export async function handlePasteSelection(mutationTabId = get(activeTabId)) {
  if (!get(isDbLoaded)) return;
  if (!mutationTabId) return;
  if (!hasCardClipboard()) {
    showToast(String(get(_)('editor.clipboard_empty')), 'info');
    return;
  }

  const clipboardCards = getCardClipboard();
  const conflictingCards = await getCardsByIdsInTab(mutationTabId, clipboardCards.map((card) => card.code));
  if (conflictingCards.length > 0) {
    const shouldOverwrite = await tauriBridge.ask(
      String(get(_)('editor.paste_conflict_confirm', {
        values: { count: String(conflictingCards.length) },
      } as never)),
      {
        title: String(get(_)('editor.paste_conflict_title')),
        kind: 'warning',
      },
    );

    if (!shouldOverwrite) return;
  }

  // getCardClipboard() already returns isolated copies.
  const pastedCards = clipboardCards;
  const ok = await modifyCardsInTab(mutationTabId, pastedCards, false);
  if (!ok) {
    showToast(String(get(_)('editor.paste_failed')), 'error');
    return;
  }

  const prevSelectedIds = getSelectedCardIds();
  await refreshSearchAfterMutation(mutationTabId, () => handleSearch(true));
  if (get(activeTabId) !== mutationTabId) return;
  const visibleIds = pastedCards
    .map((card) => card.code)
    .filter((code) => getAllCardsMap().has(code));

  if (visibleIds.length > 0) {
    setSelectedCards(visibleIds, visibleIds[0], visibleIds[0]);
  } else if (prevSelectedIds.length === 0) {
    clearSelection();
  }

  showToast(String(get(_)('editor.cards_pasted', {
    values: { count: String(pastedCards.length) },
  } as never)), 'success');
}

export async function handleDeleteSelection(mutationTabId = get(activeTabId), selectedIds = getSelectedCardIds()) {
  if (!get(isDbLoaded)) return;
  if (!mutationTabId) return;

  if (selectedIds.length === 0) {
    showToast(String(get(_)('editor.no_card_selected')), 'info');
    return;
  }

  const deletesActiveCard = selectedIds.includes(editorState.selectedId ?? -1);
  await deleteDraftCardFlow({
    tabId: mutationTabId,
    originalCardCode: null,
    selectedCardIds: selectedIds,
    t: (key, options) => String(get(_)(key, options as never)),
    resetDraftCard: () => { if (deletesActiveCard) dispatchAppShortcut('new-card'); },
    clearSelection: () => { if (deletesActiveCard) clearSelection(); },
    handleSearch: () => handleSearch(!deletesActiveCard),
  });
}
