import type { CardDataEntry, CardDraftState } from '$lib/types';

export const CARD_TEXT_SLOT_COUNT = 16;

type CardSnapshotFields = {
  code: number;
  alias: number;
  name: string;
  desc: string;
  strings: string[];
  setcode: number[];
  type: number;
  attack: number;
  defense: number;
  level: number;
  race: number;
  attribute: number;
  lscale: number;
  rscale: number;
  linkMarker: number;
  category: number;
  ot: number;
  ruleCode: number;
};

function normalizeRuleCode(value: unknown) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function normalizeCardStrings(strings: string[] | undefined) {
  return Array.from({ length: CARD_TEXT_SLOT_COUNT }, (_, index) => strings?.[index] ?? '');
}

export function formatEditableStatValue(value: number) {
  return value === -2 ? '?' : String(value);
}

export function normalizeEditableStatValue(value: number) {
  return value < 0 ? -2 : value;
}

export function formatEditableScaleValue(value: number) {
  return String(value);
}

export function normalizeEditableScaleValue(value: number) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  return Math.max(0, Math.min(13, value));
}

export function parseEditableStatInput(input: string, fallback = 0) {
  const normalized = input.trim();
  if (!normalized) return 0;
  if (normalized === '?' || normalized === '？' || normalized === '-2') {
    return -2;
  }

  const parsed = Number.parseInt(normalized, 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }

  // Allow -1 to pass through for search logic
  if (parsed === -1) {
    return -1;
  }
  
  return normalizeEditableStatValue(parsed);
}

export function parseEditableScaleInput(input: string, fallback = 0) {
  const normalized = input.trim();
  if (!normalized) return 0;

  const parsed = Number.parseInt(normalized, 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }

  // Allow -1 to pass through for draft-search exact-zero semantics
  if (parsed === -1) {
    return -1;
  }

  return normalizeEditableScaleValue(parsed);
}

export function toPersistableCard(card: CardDataEntry): CardDataEntry {
  const lscale = normalizeEditableScaleValue(card.lscale);
  const rscale = normalizeEditableScaleValue(card.rscale);
  const level = Number.isFinite(card.level) ? (card.level & 0xff) : 0;

  return {
    ...card,
    attack: normalizeEditableStatValue(card.attack),
    defense: normalizeEditableStatValue(card.defense),
    level: (level & 0xff) | ((rscale & 0xff) << 16) | ((lscale & 0xff) << 24),
    setcode: Array.isArray(card.setcode) ? [...card.setcode] : [],
    strings: normalizeCardStrings(card.strings),
    lscale,
    rscale,
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

function toCardSnapshotFields(card: CardDataEntry): CardSnapshotFields {
  return {
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
  };
}

function arraysEqual<T>(left: T[], right: T[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

export function createCardSnapshot(card: CardDataEntry) {
  return JSON.stringify(toCardSnapshotFields(card));
}

export function areCardsEquivalent(left: CardDataEntry, right: CardDataEntry) {
  const leftFields = toCardSnapshotFields(left);
  const rightFields = toCardSnapshotFields(right);

  return leftFields.code === rightFields.code
    && leftFields.alias === rightFields.alias
    && leftFields.name === rightFields.name
    && leftFields.desc === rightFields.desc
    && arraysEqual(leftFields.strings, rightFields.strings)
    && arraysEqual(leftFields.setcode, rightFields.setcode)
    && leftFields.type === rightFields.type
    && leftFields.attack === rightFields.attack
    && leftFields.defense === rightFields.defense
    && leftFields.level === rightFields.level
    && leftFields.race === rightFields.race
    && leftFields.attribute === rightFields.attribute
    && leftFields.lscale === rightFields.lscale
    && leftFields.rscale === rightFields.rscale
    && leftFields.linkMarker === rightFields.linkMarker
    && leftFields.category === rightFields.category
    && leftFields.ot === rightFields.ot
    && leftFields.ruleCode === rightFields.ruleCode;
}

export function createCardDraftState(card: CardDataEntry = createEmptyCard(), originalCode: number | null = null): CardDraftState {
  const normalizedCard = cloneEditableCard(card);
  return {
    originalCode,
    snapshot: originalCode === null ? '' : createCardSnapshot(normalizedCard),
    card: normalizedCard,
  };
}

export function getPackedLScale(level: number): number { return (level >> 24) & 0xff; }
export function getPackedRScale(level: number): number { return (level >> 16) & 0xff; }
export function getPackedLevel(level: number): number { return level & 0xff; }
export function setPackedLevel(level: number, lscale: number, rscale: number): number { return (level & 0xff) | ((rscale & 0xff) << 16) | ((lscale & 0xff) << 24); }
