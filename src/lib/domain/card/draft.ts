import type { CardDataEntry, CardDraftState } from '$lib/types';

export const CARD_TEXT_SLOT_COUNT = 16;

function normalizeRuleCode(value: unknown) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function normalizeCardStrings(strings: string[] | undefined) {
  return Array.from({ length: CARD_TEXT_SLOT_COUNT }, (_, index) => strings?.[index] ?? '');
}

export function toPersistableCard(card: CardDataEntry): CardDataEntry {
  return {
    ...card,
    setcode: Array.isArray(card.setcode) ? [...card.setcode] : [],
    strings: normalizeCardStrings(card.strings),
    ruleCode: normalizeRuleCode(card.ruleCode),
  };
}

export function cloneEditableCard(card: CardDataEntry): CardDataEntry {
  return toPersistableCard(card);
}

export function createEmptyCard(): CardDataEntry {
  return {
    code: 0,
    alias: 0,
    setcode: [0, 0, 0, 0],
    type: 0,
    attack: 0,
    defense: 0,
    level: 0,
    race: 0,
    attribute: 0,
    category: 0,
    ot: 0,
    name: '',
    desc: '',
    strings: Array.from({ length: CARD_TEXT_SLOT_COUNT }, () => ''),
    lscale: 0,
    rscale: 0,
    linkMarker: 0,
    ruleCode: 0,
  };
}

export function createCardSnapshot(card: CardDataEntry) {
  return JSON.stringify({
    code: card.code,
    alias: card.alias,
    name: card.name,
    desc: card.desc,
    strings: normalizeCardStrings(card.strings),
    setcode: Array.isArray(card.setcode) ? [...card.setcode] : [],
    type: card.type,
    attack: card.attack,
    defense: card.defense,
    level: card.level,
    race: card.race,
    attribute: card.attribute,
    lscale: card.lscale,
    rscale: card.rscale,
    linkMarker: card.linkMarker,
    category: card.category,
    ot: card.ot,
    ruleCode: card.ruleCode,
  });
}

export function createCardDraftState(card: CardDataEntry = createEmptyCard(), originalCode: number | null = null): CardDraftState {
  const normalizedCard = cloneEditableCard(card);
  return {
    originalCode,
    snapshot: originalCode === null ? '' : createCardSnapshot(normalizedCard),
    card: normalizedCard,
  };
}
