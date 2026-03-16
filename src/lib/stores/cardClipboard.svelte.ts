import { CardDataEntry } from 'ygopro-cdb-encode';

let clipboardCards = $state.raw<CardDataEntry[]>([]);

function cloneCard(card: CardDataEntry): CardDataEntry {
  return new CardDataEntry().fromPartial({
    ...card,
    setcode: Array.isArray(card.setcode) ? [...card.setcode] : card.setcode,
    strings: Array.isArray(card.strings) ? [...card.strings] : [],
  });
}

export function setCardClipboard(cards: CardDataEntry[]) {
  clipboardCards = cards.map((card) => cloneCard(card));
}

export function getCardClipboard(): CardDataEntry[] {
  return clipboardCards.map((card) => cloneCard(card));
}

export function hasCardClipboard(): boolean {
  return clipboardCards.length > 0;
}
