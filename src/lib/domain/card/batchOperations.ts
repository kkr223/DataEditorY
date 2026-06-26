import type { CardDataEntry } from '$lib/types';

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
  return {
    ...card,
    [operation.field]: normalizeBatchFieldValue(operation.field, operation.value),
    setcode: [...card.setcode],
    strings: [...card.strings],
  } as CardDataEntry;
}

function isChanged(left: CardDataEntry, right: CardDataEntry) {
  return JSON.stringify(left) !== JSON.stringify(right);
}

export function compileBatchOperationChanges(
  cards: CardDataEntry[],
  groups: BatchOperationGroup[],
  operations: BatchFieldOperation[],
) {
  const cardsById = new Map(cards.map((card) => [card.code, card]));
  const groupsById = new Map(groups.map((group) => [group.id, group]));
  const nextById = new Map<number, CardDataEntry>();

  for (const operation of operations) {
    const group = groupsById.get(operation.groupId);
    if (!group) continue;

    for (const cardId of group.cardIds) {
      const base = nextById.get(cardId) ?? cardsById.get(cardId);
      if (!base) continue;
      nextById.set(cardId, applyFieldOperation(base, operation));
    }
  }

  return [...nextById.values()].filter((card) => {
    const original = cardsById.get(card.code);
    return original ? isChanged(original, card) : false;
  });
}
