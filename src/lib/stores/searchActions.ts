import { get } from 'svelte/store';
import { locale } from 'svelte-i18n';
import { activeTabId, clearSourceFilterCacheForTab, onCachedSearchRefreshed, searchCardsPage } from '$lib/stores/db';
import { getRuleExpressionErrorMessage, RuleExpressionError } from '$lib/domain/search/ruleExpression';
import { showToast } from '$lib/stores/toast.svelte';
import {
  cardSelectionState,
  clearSelection,
  getSelectedCardIds,
  setSelectedCards,
  setSingleSelectedCard,
} from '$lib/stores/cardSelection.svelte';
import { clearSearchError, resetSearchState, searchState } from '$lib/stores/searchState.svelte';
import { getAllCards, setAllCards, setTotalCards } from '$lib/stores/searchResults.svelte';
import type { CardDataEntry } from '$lib/types';

function syncActiveSearchSnapshot(input: {
  tabId: string;
  cards: CardDataEntry[];
  total: number;
  page: number;
}) {
  if (get(activeTabId) !== input.tabId) {
    return;
  }

  const prevSelectedId = cardSelectionState.selectedId;
  const prevSelectedIds = getSelectedCardIds();
  const prevAnchorId = cardSelectionState.selectionAnchorId;

  setAllCards(input.cards);
  setTotalCards(input.total);
  searchState.currentPage = input.page;

  const visibleSelectedIds = setSelectedCards(prevSelectedIds, prevSelectedId, prevAnchorId);
  if (visibleSelectedIds.length > 0) {
    return;
  }

  const allCards = getAllCards();
  if (allCards.length > 0) {
    setSingleSelectedCard(allCards[0].code);
  } else {
    clearSelection();
  }
}

onCachedSearchRefreshed((snapshot) => {
  syncActiveSearchSnapshot(snapshot);
});

export async function handleSearch(preserveSelection = false, resetPage = false) {
  const prevSelectedId = cardSelectionState.selectedId;
  const prevSelectedIds = getSelectedCardIds();
  const prevAnchorId = cardSelectionState.selectionAnchorId;
  const prevPage = searchState.currentPage;
  const currentTabId = get(activeTabId);

  if (!currentTabId) return false;

  if (resetPage) {
    searchState.currentPage = 1;
  }

  let cards: CardDataEntry[];
  let total: number;
  try {
    ({ cards, total } = await searchCardsPage(searchState.filters, searchState.currentPage));
    clearSearchError();
  } catch (err) {
    searchState.currentPage = prevPage;

    if (err instanceof RuleExpressionError) {
      const message = getRuleExpressionErrorMessage(err, get(locale) ?? 'en');
      searchState.error = message;
      showToast(message, 'error');
      return false;
    }

    console.error('Failed to update search results:', err);
    return false;
  }

  // If the active tab changed while the search was in flight, discard the results.
  if (get(activeTabId) !== currentTabId) return false;

  setAllCards(cards);
  setTotalCards(total);

  if (preserveSelection) {
    const visibleSelectedIds = setSelectedCards(prevSelectedIds, prevSelectedId, prevAnchorId);
    if (visibleSelectedIds.length > 0) {
      return true;
    }
  }

  const allCards = getAllCards();
  if (allCards.length > 0) {
    setSingleSelectedCard(allCards[0].code);
  } else {
    clearSelection();
  }

  return true;
}

export function handleReset() {
  const tab = get(activeTabId);
  if (tab) clearSourceFilterCacheForTab(tab);
  resetSearchState();
  return handleSearch();
}
