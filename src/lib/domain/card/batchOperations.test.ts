import { describe, expect, test } from 'bun:test';
import { createEmptyCard } from '$lib/domain/card/draft';
import { compileBatchOperationChanges, normalizeBatchFieldValue } from './batchOperations';

const card = (code: number, attack = 0) => ({
  ...createEmptyCard(),
  code,
  name: `Card ${code}`,
  attack,
});

describe('batch card operations', () => {
  test('applies operation groups in order to overlapping card groups', () => {
    const changed = compileBatchOperationChanges(
      [card(1), card(2), card(3)],
      [
        { id: 'group-a', cardIds: [1, 2] },
        { id: 'group-b', cardIds: [2] },
      ],
      [
        { groupId: 'group-a', field: 'attack', value: 1000 },
        { groupId: 'group-b', field: 'attack', value: 2000 },
      ],
    );

    expect(changed.map(({ code, attack }) => ({ code, attack }))).toEqual([
      { code: 1, attack: 1000 },
      { code: 2, attack: 2000 },
    ]);
  });

  test('omits cards whose resulting value did not change', () => {
    const changed = compileBatchOperationChanges(
      [card(1, 1000)],
      [{ id: 'group', cardIds: [1] }],
      [{ groupId: 'group', field: 'attack', value: 1000 }],
    );

    expect(changed).toEqual([]);
  });

  test('normalizes empty and structured values using card field semantics', () => {
    expect(normalizeBatchFieldValue('attack', '')).toBe(0);
    expect(normalizeBatchFieldValue('name', null)).toBe('');
    expect(normalizeBatchFieldValue('setcode', ['452', 'bad', 4660])).toEqual([452, 4660]);
  });
});
