import type { CardDataEntry } from '$lib/types';
import { cloneCard } from './cardUtils';

let clipboardCards = $state.raw<CardDataEntry[]>([]);

export function setCardClipboard(cards: CardDataEntry[]) {
  clipboardCards = cards.map((card) => cloneCard(card));
}

export function getCardClipboard(): CardDataEntry[] {
  return clipboardCards.map((card) => cloneCard(card));
}

export function hasCardClipboard(): boolean {
  return clipboardCards.length > 0;
}
