import type { CardDataEntry } from '#lib/types/index.ts';

export function cloneCard(card: CardDataEntry): CardDataEntry {
  return {
    ...card,
    setcode: [...card.setcode],
    strings: [...card.strings],
  };
}

export function cloneCards(cards: CardDataEntry[]): CardDataEntry[] {
  return cards.map((card) => cloneCard(card));
}
