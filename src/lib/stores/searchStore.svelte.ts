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
import { DEFAULT_SEARCH_FILTERS, type CardDataEntry, type SearchFilters } from '$lib/types';

export const searchState = $state<{
  currentPage: number;
  filters: SearchFilters;
  error: string;
  isFilterOpen: boolean;
}>({
  currentPage: 1,
  filters: { ...DEFAULT_SEARCH_FILTERS },
  error: '',
  isFilterOpen: false,
});

// Search results can contain 10k+ cards. Keeping them raw avoids Svelte 5's
// deep proxy cost while still letting consumers react to whole-result changes.
let _allCards = $state.raw<CardDataEntry[]>([]);
let _allCardsMap = $state.raw<Map<number, CardDataEntry>>(new Map());
let _allCardsIndexMap = $state.raw<Map<number, number>>(new Map());
let _visibleCardIdSet = $state.raw<Set<number>>(new Set());
let _totalCards = $state(0);
let latestSearchRequestId = 0;
let activeSearchContext: {
  requestId: number;
  tabId: string;
  preserveSelection: boolean;
} | null = null;

const cloneSearchFilters = (filters: SearchFilters): SearchFilters => ({
  ...DEFAULT_SEARCH_FILTERS,
  ...filters,
});

function rebuildCardIndexes(cards: CardDataEntry[]) {
  const cardMap = new Map<number, CardDataEntry>();
  const indexMap = new Map<number, number>();
  const visibleIdSet = new Set<number>();

  cards.forEach((card, index) => {
    cardMap.set(card.code, card);
    indexMap.set(card.code, index);
    visibleIdSet.add(card.code);
  });

  _allCardsMap = cardMap;
  _allCardsIndexMap = indexMap;
  _visibleCardIdSet = visibleIdSet;
}

function syncActiveSearchSnapshot(input: {
  tabId: string;
  cards: CardDataEntry[];
  total: number;
  page: number;
}, options: { preserveSelection: boolean }) {
  if (get(activeTabId) !== input.tabId) {
    return;
  }

  const prevSelectedId = cardSelectionState.selectedId;
  const prevSelectedIds = getSelectedCardIds();
  const prevAnchorId = cardSelectionState.selectionAnchorId;

  setAllCards(input.cards);
  setTotalCards(input.total);
  searchState.currentPage = input.page;

  if (options.preserveSelection) {
    const visibleSelectedIds = setSelectedCards(prevSelectedIds, prevSelectedId, prevAnchorId);
    if (visibleSelectedIds.length > 0) {
      return;
    }
  }

  const allCards = getAllCards();
  if (allCards.length > 0) {
    setSingleSelectedCard(allCards[0].code);
  } else {
    clearSelection();
  }
}

onCachedSearchRefreshed((snapshot) => {
  const context = activeSearchContext?.tabId === snapshot.tabId ? activeSearchContext : null;
  syncActiveSearchSnapshot(snapshot, {
    preserveSelection: context?.preserveSelection ?? true,
  });
});

export function getAllCards(): CardDataEntry[] {
  return _allCards;
}

export function setAllCards(cards: CardDataEntry[]): void {
  _allCards = cards;
  rebuildCardIndexes(cards);
}

export function getAllCardsMap(): Map<number, CardDataEntry> {
  return _allCardsMap;
}

export function getCardById(cardId: number | null | undefined): CardDataEntry | undefined {
  return _allCardsMap.get(cardId ?? -1);
}

export function hasVisibleCard(cardId: number) {
  return _visibleCardIdSet.has(cardId);
}

export function getVisibleCardIds(cardIds: number[]): number[] {
  if (cardIds.length === 0) return [];

  return cardIds
    .filter((id) => _visibleCardIdSet.has(id))
    .sort((_a, _b) => (_allCardsIndexMap.get(_a) ?? Number.MAX_SAFE_INTEGER) - (_allCardsIndexMap.get(_b) ?? Number.MAX_SAFE_INTEGER));
}

export function getCardIndex(cardId: number) {
  return _allCardsIndexMap.get(cardId) ?? -1;
}

export function updateVisibleCards(cards: CardDataEntry[]): void {
  if (cards.length === 0) return;

  const nextByCode = new Map(cards.map((card) => [card.code, card]));
  _allCards = _allCards.map((card) => nextByCode.get(card.code) ?? card);
  rebuildCardIndexes(_allCards);
}

export function getTotalCards(): number {
  return _totalCards;
}

export function setTotalCards(total: number): void {
  _totalCards = total;
}

export function clearSearchError() {
  searchState.error = '';
}

export function resetSearchState() {
  searchState.filters = { ...DEFAULT_SEARCH_FILTERS };
  searchState.error = '';
  searchState.currentPage = 1;
}

export async function handleSearch(preserveSelection = false, resetPage = false) {
  const requestId = ++latestSearchRequestId;
  const currentTabId = get(activeTabId);

  if (!currentTabId) return false;

  const requestedPage = resetPage ? 1 : searchState.currentPage;
  const filtersSnapshot = cloneSearchFilters(searchState.filters);
  activeSearchContext = { requestId, tabId: currentTabId, preserveSelection };

  try {
    await searchCardsPage(filtersSnapshot, requestedPage);
    if (requestId !== latestSearchRequestId || get(activeTabId) !== currentTabId) return false;
    clearSearchError();
  } catch (err) {
    if (requestId !== latestSearchRequestId || get(activeTabId) !== currentTabId) return false;

    if (err instanceof RuleExpressionError) {
      const message = getRuleExpressionErrorMessage(err, get(locale) ?? 'en');
      searchState.error = message;
      showToast(message, 'error');
      return false;
    }

    console.error('Failed to update search results:', err);
    return false;
  } finally {
    if (activeSearchContext?.requestId === requestId) {
      activeSearchContext = null;
    }
  }

  return true;
}

export function handleReset() {
  const tab = get(activeTabId);
  if (tab) clearSourceFilterCacheForTab(tab);
  resetSearchState();
  return handleSearch();
}
