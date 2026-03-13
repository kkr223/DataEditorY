import { searchCards, activeTabId, getCachedCards } from '$lib/stores/db';
import type { CardDataEntry } from 'ygopro-cdb-encode';

// allCards is a large array (potentially 10k+ items) that is only used for
// read-only rendering in CardList. Using $state.raw avoids Svelte 5's deep
// proxy creation — a massive win when the array contains thousands of objects.
let _allCards = $state.raw<CardDataEntry[]>([]);

// O(1) lookup map, rebuilt whenever the search results change
let _allCardsMap = $state.raw<Map<number, CardDataEntry>>(new Map());

// The rest of the editor state is small and benefits from deep reactivity
export const editorState = $state<{
  selectedId: number | null;
  currentPage: number;
  searchFilters: {
    id: string;
    name: string;
    desc: string;
    atkMin: string;
    atkMax: string;
    defMin: string;
    defMax: string;
    type: string;
    subtype: string;
    attribute: string;
    race: string;
  };
  isFilterOpen: boolean;
}>({
  selectedId: null,
  currentPage: 1,
  searchFilters: {
    id: '', name: '', desc: '', atkMin: '', atkMax: '', defMin: '', defMax: '', type: '', subtype: '', attribute: '', race: ''
  },
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

export function getSelectedCard(): CardDataEntry | null {
  return _allCardsMap.get(editorState.selectedId ?? -1) ?? null;
}

export function handleSearch() {
  setAllCards(searchCards(editorState.searchFilters));
  editorState.currentPage = 1;
  if (_allCards.length > 0) {
    editorState.selectedId = _allCards[0].code;
  }
}

export function handleReset() {
  editorState.searchFilters = { id: '', name: '', desc: '', atkMin: '', atkMax: '', defMin: '', defMax: '', type: '', subtype: '', attribute: '', race: '' };
  handleSearch();
}
