import { expect, test } from 'bun:test';
import { applyReplacementPlan } from './applyReplacement';
import type { WorkspaceReplacePreview } from './types';

const preview = (): WorkspaceReplacePreview => ({ cards: [{} as WorkspaceReplacePreview['cards'][number]], edits: [],
  scripts: [1, 2].map(cardId => ({ cardId, cardName: '', path: `c${cardId}.lua`, before: `old${cardId}`, after: `new${cardId}` })) });
const setup = (commitCards: () => Promise<unknown> = async () => {}) => {
  const buffers = new Map([['1', 'old1'], ['2', 'old2']]);
  let current = true;
  return { buffers, leave: () => { current = false; }, deps: {
    isCurrent: () => current,
    prepareScript: async (script: WorkspaceReplacePreview['scripts'][number]) => String(script.cardId),
    readBuffer: (id: string) => buffers.get(id),
    writeBuffer: (id: string, before: string, after: string) => { buffers.set(id, after); return () => { buffers.set(id, before); }; },
    commitCards,
  } };
};

test('all scripts are checked before any edit and successful changes remain in their buffers', async () => {
  const first = setup();
  first.buffers.set('2', 'user edit');
  await expect(applyReplacementPlan(preview(), first.deps)).rejects.toThrow('changed');
  expect(first.buffers.get('1')).toBe('old1');
  expect(first.buffers.get('2')).toBe('user edit');
  const second = setup();
  await applyReplacementPlan(preview(), second.deps);
  expect([...second.buffers.values()]).toEqual(['new1', 'new2']);
});

test('a failed CDB compare-and-swap restores only buffers that were not edited again', async () => {
  const original = setup(async () => { throw new Error('changed'); });
  await expect(applyReplacementPlan(preview(), original.deps)).rejects.toThrow('changed');
  expect([...original.buffers.values()]).toEqual(['old1', 'old2']);
  const concurrent = setup(async () => { concurrent.buffers.set('2', 'new user edit'); throw new Error('changed'); });
  await expect(applyReplacementPlan(preview(), concurrent.deps)).rejects.toThrow('replacementPartial');
  expect(concurrent.buffers.get('1')).toBe('old1');
  expect(concurrent.buffers.get('2')).toBe('new user edit');
});

test('leaving the owning workspace during preparation never edits another workspace', async () => {
  const state = setup();
  state.deps.prepareScript = async script => { state.leave(); return String(script.cardId); };
  await expect(applyReplacementPlan(preview(), state.deps)).rejects.toThrow('changed');
  expect([...state.buffers.values()]).toEqual(['old1', 'old2']);
});
