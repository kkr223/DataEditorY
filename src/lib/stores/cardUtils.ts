import type { CardDataEntry } from '$lib/types';

export function cloneCard(card: CardDataEntry): CardDataEntry {
  return {
    ...card,
    setcode: Array.isArray(card.setcode) ? [...card.setcode] : [],
    strings: Array.isArray(card.strings) ? [...card.strings] : [],
    ruleCode: Number(card.ruleCode ?? 0),
  };
}

export function cloneCards(cards: CardDataEntry[]): CardDataEntry[] {
  return cards.map((card) => cloneCard(card));
}
