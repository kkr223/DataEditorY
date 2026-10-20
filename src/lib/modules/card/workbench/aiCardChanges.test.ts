import { expect, test } from 'bun:test';
import { createEmptyCard } from '$lib/domain/card/draft';
import { applyAiCardChanges } from './aiCardChanges';
import type { CardDataEntry } from '$lib/types';

const card = (code = 100): CardDataEntry => ({
  ...createEmptyCard(), code, name: 'Original', attack: 1000,
});

test('AI changes preserve fields edited after the proposal and send exact read preconditions', async () => {
  const before = card();
  const current = { ...before, attack: 2000 };
  let confirmations = 0;
  let written: CardDataEntry[] = [];
  let expected: CardDataEntry[] = [];
  const result = await applyAiCardChanges([{ cardCode: 100, before, patch: { name: 'AI name' } }], {
    readCard: async () => current,
    confirmConflict: async () => { confirmations++; return true; },
    commit: async (cards, originals) => { written = cards; expected = originals; },
  });
  expect(result).toBe(written);
  expect(written[0].name).toBe('AI name');
  expect(written[0].attack).toBe(2000);
  expect(expected).toEqual([current]);
  expect(confirmations).toBe(0);
});

test('conflicting fields require confirmation and rejection prevents the entire batch', async () => {
  const cards = new Map([[100, card()], [200, { ...card(200), name: 'User name' }]]);
  let writes = 0;
  const confirmations: number[] = [];
  await expect(applyAiCardChanges([100, 200].map(code => ({
    cardCode: code, before: card(code), patch: { name: 'AI name' },
  })), {
    readCard: async code => cards.get(code)!,
    confirmConflict: async code => { confirmations.push(code); return false; },
    commit: async () => { writes++; },
  })).rejects.toThrow('Skipped changed card 200');
  expect(writes).toBe(0);
  expect(confirmations).toEqual([200]);
});

test('confirmed conflicts still preserve unrelated edits', async () => {
  const current = { ...card(), name: 'User name', attack: 2500 };
  const result = await applyAiCardChanges([{ cardCode: 100, before: card(), patch: { name: 'AI name' } }], {
    readCard: async () => current, confirmConflict: async () => true, commit: async () => {},
  });
  expect(result[0].name).toBe('AI name');
  expect(result[0].attack).toBe(2500);
});

test('a proposal without a baseline must be reviewed', async () => {
  let confirmations = 0;
  await applyAiCardChanges([{ cardCode: 100, before: null, patch: { name: 'AI' } }], {
    readCard: async () => card(),
    confirmConflict: async () => { confirmations++; return true; },
    commit: async () => {},
  });
  expect(confirmations).toBe(1);
});

test('the host can reject a change that raced with confirmation', async () => {
  await expect(applyAiCardChanges([{ cardCode: 100, before: card(), patch: { name: 'AI' } }], {
    readCard: async () => card(), confirmConflict: async () => true,
    commit: async () => { throw new Error('Card changed since review'); },
  })).rejects.toThrow('Card changed since review');
});

test('AI cannot bypass asset migration by changing a card ID through upsert', async () => {
  let writes = 0;
  await expect(applyAiCardChanges([{ cardCode: 100, before: card(), patch: { code: 200 } }], {
    readCard: async () => card(), confirmConflict: async () => true,
    commit: async () => { writes++; },
  })).rejects.toThrow('Use the card editor');
  expect(writes).toBe(0);
});
