import { searchCardsPage } from '$lib/stores/db';
import type { CardDataEntry } from 'ygopro-cdb-encode';
import { DEFAULT_SEARCH_FILTERS } from '$lib/types';
import type { SearchFilterState } from '$lib/types';

// allCards is a large array (potentially 10k+ items) that is only used for
// read-only rendering in CardList. Using $state.raw avoids Svelte 5's deep
// proxy creation — a massive win when the array contains thousands of objects.
let _allCards = $state.raw<CardDataEntry[]>([]);

// O(1) lookup map, rebuilt whenever the search results change
let _allCardsMap = $state.raw<Map<number, CardDataEntry>>(new Map());
let _totalCards = $state(0);

// The rest of the editor state is small and benefits from deep reactivity
export const editorState = $state<{
  selectedId: number | null;
  currentPage: number;
  searchFilters: SearchFilterState;
  isFilterOpen: boolean;
}>({
  selectedId: null,
  currentPage: 1,
  searchFilters: { ...DEFAULT_SEARCH_FILTERS },
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
  const map = new Map<number, CardDataEntry>();
  for (const c of cards) {
    map.set(c.code, c);
  }
  _allCardsMap = map;
}

export function getAllCardsMap(): Map<number, CardDataEntry> {
  return _allCardsMap;
}

export function getTotalCards(): number {
  return _totalCards;
}

export function setTotalCards(total: number): void {
  _totalCards = total;
}

export function getSelectedCard(): CardDataEntry | null {
  return _allCardsMap.get(editorState.selectedId ?? -1) ?? null;
}

export function handleSearch(preserveSelection = false, resetPage = false) {
  const prevSelectedId = editorState.selectedId;
  if (resetPage) {
    editorState.currentPage = 1;
  }
  const { cards, total } = searchCardsPage(editorState.searchFilters, editorState.currentPage);
  setAllCards(cards);
  _totalCards = total;
  // If preserveSelection is requested and the card still exists, keep it selected
  if (preserveSelection && prevSelectedId !== null && _allCardsMap.has(prevSelectedId)) {
    editorState.selectedId = prevSelectedId;
  } else if (_allCards.length > 0) {
    editorState.selectedId = _allCards[0].code;
  } else {
    editorState.selectedId = null;
  }
}

export function handleReset() {
  editorState.searchFilters = { ...DEFAULT_SEARCH_FILTERS };
  editorState.currentPage = 1;
  handleSearch();
}
