import { describe, expect, test } from 'bun:test';
import { createEmptyCard } from '$lib/domain/card/draft';
import { compileBatchOperationChanges, normalizeBatchFieldValue } from './batchOperations';
import { parseBatchInput, formatBatchValue } from './batchInput';

const card = (code: number, attack = 0) => ({
  ...createEmptyCard(),
  code,
  name: `Card ${code}`,
  attack,
});

describe('batch card operations', () => {
  test('replaces and clears setcodes without overwriting them with the original array', () => {
    const original = { ...card(1), setcode: [0x1111], strings: ['old'] };
    const groups = [{ id: 'group', cardIds: [1] }];
    const changed = compileBatchOperationChanges([original], groups, [{ groupId: 'group', field: 'setcode', value: [0x1cc, 0x1234] }]);
    expect(changed[0].setcode).toEqual([0x1cc, 0x1234]);
    expect(original.setcode).toEqual([0x1111]);
    expect(compileBatchOperationChanges([original], groups, [{ groupId: 'group', field: 'setcode', value: [] }])[0].setcode).toEqual([]);
    expect(compileBatchOperationChanges([original], groups, [{ groupId: 'group', field: 'strings', value: ['new'] }])[0].strings[0]).toBe('new');
  });

  test('repacks levels and pendulum scales while preserving untouched fields', () => {
    const original = { ...card(1, 1000), level: 4, lscale: 2, rscale: 3 };
    const changed = compileBatchOperationChanges([original], [{ id: 'group', cardIds: [1] }], [
      { groupId: 'group', field: 'lscale', value: 8 },
      { groupId: 'group', field: 'level', value: 7 },
    ])[0];
    expect(changed.level).toBe(7 | (3 << 16) | (8 << 24));
    expect(changed.attack).toBe(1000);
    expect(changed.rscale).toBe(3);
  });

  test('edits the stored alias column even when a rule code or alias already exists', () => {
    const groups = [{ id: 'group', cardIds: [1] }];
    const rule = compileBatchOperationChanges([{ ...card(1), alias: 100 }], groups, [{ groupId: 'group', field: 'ruleCode', value: 200 }])[0];
    expect(rule.alias).toBe(0);
    expect(rule.ruleCode).toBe(200);
    const alias = compileBatchOperationChanges([{ ...card(1), ruleCode: 100 }], groups, [{ groupId: 'group', field: 'alias', value: 0 }])[0];
    expect(alias.alias).toBe(0);
    expect(alias.ruleCode).toBe(0);
  });

  test('validates typed input instead of silently resetting malformed values', () => {
    expect(parseBatchInput('setcode', '01CC, 0x1234')).toEqual([0x1cc, 0x1234]);
    expect(parseBatchInput('attack', '?')).toBe(-2);
    expect(parseBatchInput('race', '0x2000')).toBe(0x2000);
    expect(() => parseBatchInput('setcode', 'GGGG')).toThrow();
    expect(() => parseBatchInput('setcode', '1,2,3,4,5')).toThrow();
    expect(() => parseBatchInput('attack', 'oops')).toThrow();
    expect(() => parseBatchInput('attack', '1.5')).toThrow();
    expect(() => parseBatchInput('lscale', '14')).toThrow();
    expect(formatBatchValue('setcode', [0x1cc, 0x1234])).toBe('0x01CC, 0x1234');
  });

  test('does not report empty setcodes or a no-op alias representation as changes', () => {
    const groups = [{ id: 'group', cardIds: [1] }];
    expect(compileBatchOperationChanges([card(1)], groups, [{ groupId: 'group', field: 'setcode', value: [] }])).toEqual([]);
    expect(compileBatchOperationChanges([{ ...card(1), ruleCode: 100 }], groups, [{ groupId: 'group', field: 'alias', value: 100 }])).toEqual([]);
  });
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
