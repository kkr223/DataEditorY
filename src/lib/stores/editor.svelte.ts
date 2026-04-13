import { get } from 'svelte/store';
import { locale } from 'svelte-i18n';
import { activeTabId, cacheActiveTabSelection, onCachedSearchRefreshed, searchCardsPage } from '$lib/stores/db';
import { getRuleExpressionErrorMessage, RuleExpressionError } from '$lib/domain/search/ruleExpression';
import { showToast } from '$lib/stores/toast.svelte';
import { DEFAULT_SEARCH_FILTERS } from '$lib/types';
import type { CardDataEntry, SearchFilters } from '$lib/types';

// allCards is a large array (potentially 10k+ items) that is only used for
// read-only rendering in CardList. Using $state.raw avoids Svelte 5's deep
// proxy creation — a massive win when the array contains thousands of objects.
let _allCards = $state.raw<CardDataEntry[]>([]);

// O(1) lookup map, rebuilt whenever the search results change
let _allCardsMap = $state.raw<Map<number, CardDataEntry>>(new Map());
let _allCardsIndexMap = $state.raw<Map<number, number>>(new Map());
let _visibleCardIdSet = $state.raw<Set<number>>(new Set());
let _totalCards = $state(0);

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

function getVisibleSelectedIds(selectedIds: number[]): number[] {
  if (selectedIds.length === 0) return [];

  return selectedIds
    .filter((id) => _visibleCardIdSet.has(id))
    .sort((_a, _b) => (_allCardsIndexMap.get(_a) ?? Number.MAX_SAFE_INTEGER) - (_allCardsIndexMap.get(_b) ?? Number.MAX_SAFE_INTEGER));
}

function applySelection(ids: number[], primaryId: number | null = null, anchorId: number | null = null) {
  const visibleIds = getVisibleSelectedIds(ids);
  const visibleIdSet = new Set(visibleIds);
  const nextPrimaryId =
    primaryId !== null && visibleIdSet.has(primaryId)
      ? primaryId
      : visibleIds[0] ?? null;
  const nextAnchorId =
    anchorId !== null && visibleIdSet.has(anchorId)
      ? anchorId
      : nextPrimaryId;

  editorState.selectedIds = visibleIds;
  editorState.selectedId = nextPrimaryId;
  editorState.selectionAnchorId = nextAnchorId;
  cacheActiveTabSelection(visibleIds, nextPrimaryId, nextAnchorId);
}

// The rest of the editor state is small and benefits from deep reactivity
export const editorState = $state<{
  selectedId: number | null;
  selectedIds: number[];
  selectionAnchorId: number | null;
  currentPage: number;
  searchFilters: SearchFilters;
  searchError: string;
  isFilterOpen: boolean;
}>({
  selectedId: null,
  selectedIds: [],
  selectionAnchorId: null,
  currentPage: 1,
  searchFilters: { ...DEFAULT_SEARCH_FILTERS },
  searchError: '',
  isFilterOpen: false
});

// Expose allCards and allCardsMap as getters/setters so components can use them
// the same way as before (editorState.allCards / editorState.allCardsMap) via
// a thin wrapper, while keeping them out of the deeply-proxied state object.
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

function syncActiveSearchSnapshot(input: {
  tabId: string;
  cards: CardDataEntry[];
  total: number;
  page: number;
}) {
  if (get(activeTabId) !== input.tabId) {
    return;
  }

  const prevSelectedId = editorState.selectedId;
  const prevSelectedIds = [...editorState.selectedIds];
  const prevAnchorId = editorState.selectionAnchorId;

  setAllCards(input.cards);
  _totalCards = input.total;
  editorState.currentPage = input.page;

  const visibleSelectedIds = getVisibleSelectedIds(prevSelectedIds);
  if (visibleSelectedIds.length > 0) {
    applySelection(visibleSelectedIds, prevSelectedId, prevAnchorId);
    return;
  }

  if (_allCards.length > 0) {
    setSingleSelectedCard(_allCards[0].code);
  } else {
    clearSelection();
  }
}

onCachedSearchRefreshed((snapshot) => {
  syncActiveSearchSnapshot(snapshot);
});

export function getSelectedCard(): CardDataEntry | null {
  return _allCardsMap.get(editorState.selectedId ?? -1) ?? null;
}

export function getSelectedCards(): CardDataEntry[] {
  return getVisibleSelectedIds(editorState.selectedIds)
    .map((id) => _allCardsMap.get(id))
    .filter((card): card is CardDataEntry => card !== undefined);
}

export function getSelectedCardIds(): number[] {
  return [...editorState.selectedIds];
}

export function clearSelection() {
  editorState.selectedIds = [];
  editorState.selectedId = null;
  editorState.selectionAnchorId = null;
  cacheActiveTabSelection([], null, null);
}

export function clearSearchError() {
  editorState.searchError = '';
}

export function setSingleSelectedCard(cardId: number | null) {
  if (cardId === null || !_allCardsMap.has(cardId)) {
    clearSelection();
    return;
  }

  applySelection([cardId], cardId, cardId);
}

export function setSelectedCards(cardIds: number[], primaryId: number | null = null, anchorId: number | null = null) {
  applySelection(cardIds, primaryId, anchorId);
}

export function toggleCardSelection(cardId: number) {
  if (!_allCardsMap.has(cardId)) return;

  if (editorState.selectedIds.includes(cardId)) {
    const remaining = editorState.selectedIds.filter((id) => id !== cardId);
    applySelection(
      remaining,
      editorState.selectedId === cardId ? remaining[remaining.length - 1] ?? null : editorState.selectedId,
      editorState.selectionAnchorId === cardId ? remaining[remaining.length - 1] ?? null : editorState.selectionAnchorId
    );
    return;
  }

  applySelection([...editorState.selectedIds, cardId], cardId, cardId);
}

export function selectCardRange(cardId: number, preserveExisting = false) {
  if (!_allCardsMap.has(cardId)) return;

  const anchorId = editorState.selectionAnchorId ?? editorState.selectedId ?? cardId;
  const anchorIndex = _allCardsIndexMap.get(anchorId) ?? -1;
  const targetIndex = _allCardsIndexMap.get(cardId) ?? -1;

  if (anchorIndex === -1 || targetIndex === -1) {
    setSingleSelectedCard(cardId);
    return;
  }

  const [start, end] = anchorIndex < targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex];
  const rangeIds = _allCards.slice(start, end + 1).map((card) => card.code);
  const nextIds = preserveExisting ? [...editorState.selectedIds, ...rangeIds] : rangeIds;
  applySelection(nextIds, cardId, anchorId);
}

export async function handleSearch(preserveSelection = false, resetPage = false) {
  const prevSelectedId = editorState.selectedId;
  const prevSelectedIds = [...editorState.selectedIds];
  const prevAnchorId = editorState.selectionAnchorId;
  const prevPage = editorState.currentPage;

  if (resetPage) {
    editorState.currentPage = 1;
  }

  let cards: CardDataEntry[];
  let total: number;
  try {
    ({ cards, total } = await searchCardsPage(editorState.searchFilters, editorState.currentPage));
    clearSearchError();
  } catch (err) {
    editorState.currentPage = prevPage;

    if (err instanceof RuleExpressionError) {
      const message = getRuleExpressionErrorMessage(err, get(locale) ?? 'en');
      editorState.searchError = message;
      showToast(message, 'error');
      return false;
    }

    console.error('Failed to update search results:', err);
    return false;
  }

  setAllCards(cards);
  _totalCards = total;

  if (preserveSelection) {
    const visibleSelectedIds = getVisibleSelectedIds(prevSelectedIds);
    if (visibleSelectedIds.length > 0) {
      applySelection(visibleSelectedIds, prevSelectedId, prevAnchorId);
      return true;
    }
  }

  if (_allCards.length > 0) {
    setSingleSelectedCard(_allCards[0].code);
  } else {
    clearSelection();
  }

  return true;
}

export function handleReset() {
  editorState.searchFilters = { ...DEFAULT_SEARCH_FILTERS };
  clearSearchError();
  editorState.currentPage = 1;
  return handleSearch();
}
