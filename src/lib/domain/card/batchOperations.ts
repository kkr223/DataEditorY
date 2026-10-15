import type { CardDataEntry } from '$lib/types';
import { toPersistableCard } from './draft';

export type BatchOperationGroup = {
  id: string;
  cardIds: number[];
};

export type BatchFieldOperation = {
  groupId: string;
  field: keyof CardDataEntry;
  value: unknown;
};

export function normalizeBatchFieldValue(
  field: keyof CardDataEntry,
  value: unknown,
): CardDataEntry[keyof CardDataEntry] {
  if (field === 'name' || field === 'desc') {
    return String(value ?? '');
  }

  if (field === 'strings') {
    return Array.isArray(value) ? value.map((item) => String(item ?? '')).slice(0, 16) : [];
  }

  if (field === 'setcode') {
    return Array.isArray(value)
      ? value.map((item) => Number(item)).filter((item) => Number.isFinite(item))
      : [];
  }

  const numberValue = Number(value);
  return (Number.isFinite(numberValue) ? numberValue : 0) as CardDataEntry[keyof CardDataEntry];
}

function applyFieldOperation(card: CardDataEntry, operation: BatchFieldOperation) {
  const next = {
    ...card,
    setcode: [...card.setcode],
    strings: [...card.strings],
    [operation.field]: normalizeBatchFieldValue(operation.field, operation.value),
  } as CardDataEntry;
  // Alias and rule code share one CDB column; the edited value must take precedence.
  if (operation.field === 'alias') next.ruleCode = 0;
  if (operation.field === 'ruleCode') next.alias = 0;
  return toPersistableCard(next);
}

function isChanged(left: CardDataEntry, right: CardDataEntry) {
  const storedFields = (card: CardDataEntry) => ({ ...card, alias: card.alias || card.ruleCode, ruleCode: 0 });
  return JSON.stringify(storedFields(left)) !== JSON.stringify(storedFields(right));
}

function normalizeBatchCard(card: CardDataEntry) {
  const next = toPersistableCard(card);
  return {
    ...next,
    setcode: next.setcode.filter(Boolean).slice(0, 4),
    defense: next.type & 0x4000000 ? 0 : next.defense,
    linkMarker: next.type & 0x4000000 ? next.linkMarker : 0,
  };
}

export function compileBatchOperationChanges(
  cards: CardDataEntry[],
  groups: BatchOperationGroup[],
  operations: BatchFieldOperation[],
) {
  const cardsById = new Map(cards.map((card) => [card.code, normalizeBatchCard(card)]));
  const groupsById = new Map(groups.map((group) => [group.id, group]));
  const nextById = new Map<number, CardDataEntry>();

  for (const operation of operations) {
    const group = groupsById.get(operation.groupId);
    if (!group) throw new Error(`Unknown card group: ${operation.groupId}`);

    for (const cardId of group.cardIds) {
      const base = nextById.get(cardId) ?? cardsById.get(cardId);
      if (!base) continue;
      nextById.set(cardId, applyFieldOperation(base, operation));
    }
  }

  return [...nextById.values()].map(normalizeBatchCard).filter((card) => {
    const original = cardsById.get(card.code);
    return original ? isChanged(original, card) : false;
  });
}
