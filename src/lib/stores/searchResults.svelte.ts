import type { CardDataEntry } from '$lib/types';

// Search results can contain 10k+ cards. Keeping them raw avoids Svelte 5's
// deep proxy cost while still letting consumers react to whole-result changes.
let _allCards = $state.raw<CardDataEntry[]>([]);
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
