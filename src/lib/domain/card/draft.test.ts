import { describe, expect, test } from 'bun:test';
import {
  areCardsEquivalent,
  CARD_TEXT_SLOT_COUNT,
  createCardDraftState,
  createEmptyCard,
  normalizeCardStrings,
  toPersistableCard,
} from './draft';

describe('card draft helpers', () => {
  test('normalizes strings to fixed slots', () => {
    const normalized = normalizeCardStrings(['A', 'B']);

    expect(normalized).toHaveLength(CARD_TEXT_SLOT_COUNT);
    expect(normalized[0]).toBe('A');
    expect(normalized[1]).toBe('B');
    expect(normalized.at(-1)).toBe('');
  });

  test('creates persistable cards with cloned collections', () => {
    const card = {
      ...createEmptyCard(),
      code: 123,
      setcode: [1, 2, 3, 4],
      strings: ['alpha'],
      ruleCode: Number.NaN,
    };

    const persistable = toPersistableCard(card);
    persistable.setcode[0] = 99;
    persistable.strings[0] = 'beta';

    expect(card.setcode[0]).toBe(1);
    expect(card.strings[0]).toBe('alpha');
    expect(persistable.ruleCode).toBe(0);
    expect(persistable.strings).toHaveLength(CARD_TEXT_SLOT_COUNT);
  });

  test('builds draft state with snapshot for existing cards', () => {
    const card = { ...createEmptyCard(), code: 456, name: 'Test Card' };
    const draft = createCardDraftState(card, 456);

    expect(draft.originalCode).toBe(456);
    expect(draft.snapshot).toContain('"code":456');
    expect(draft.card).not.toBe(card);
  });

  test('compares cards without serializing snapshots', () => {
    const baseCard = {
      ...createEmptyCard(),
      code: 789,
      setcode: [1, 2],
      strings: ['alpha'],
    };

    expect(areCardsEquivalent(baseCard, { ...baseCard, strings: ['alpha', '', ''] })).toBe(true);
    expect(areCardsEquivalent(baseCard, { ...baseCard, name: 'Changed' })).toBe(false);
    expect(areCardsEquivalent(baseCard, { ...baseCard, setcode: [1, 3] })).toBe(false);
  });
});
