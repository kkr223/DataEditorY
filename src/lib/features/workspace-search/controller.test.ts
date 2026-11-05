import { expect, test } from 'bun:test';
import { get } from 'svelte/store';
import { createWorkspaceSearchController } from './controller';
import type { WorkspaceReplacePreview, WorkspaceReplaceRequest, WorkspaceSearchRequest, WorkspaceSearchResult } from './types';

const empty: WorkspaceSearchResult = { cards: [], scripts: [], limited: false, warnings: [] };
const setup = (query: (request: WorkspaceSearchRequest) => Promise<WorkspaceSearchResult>,
  replacement: Partial<Pick<Parameters<typeof createWorkspaceSearchController>[0], 'previewReplace' | 'applyReplace'>> = {}) => {
  let active = true;
  let revision = 1;
  let valid = true;
  const controller = createWorkspaceSearchController({
    query, isCurrent: () => active, getRevision: () => revision,
    commitDraft: async () => valid,
    getBuffers: () => [{ cardId: 10, content: 'unsaved content' }],
    previewReplace: async () => ({ cards: [], scripts: [], edits: [] }),
    applyReplace: async () => {},
    ...replacement,
  });
  controller.change({ text: 'content' });
  return { ...controller, leave: () => { active = false; }, mutate: () => { revision++; }, block: () => { valid = false; } };
};

test('search submits options and current buffers only after the draft commits', async () => {
  let request: WorkspaceSearchRequest | undefined;
  const controller = setup(async (input) => { request = input; return empty; });
  controller.change({ caseSensitive: true, regex: true, searchCards: false });
  await controller.run();
  expect(request).toEqual({ text: 'content', caseSensitive: true, regex: true, searchCards: false, searchScripts: true, buffers: [{ cardId: 10, content: 'unsaved content' }] });
  expect(get(controller.state).result).toEqual(empty);
  controller.block();
  await controller.run();
  expect(get(controller.state).error).toBe('draftBlocked');
});

const results = (): WorkspaceSearchResult => ({ ...empty, cards: [{ cardId: 10, cardName: 'content content', path: null,
  matches: [1, 9].map(column => ({ field: 'name', line: 1, column, endColumn: column + 7,
    before: '', matched: 'content', after: '', sourceHash: 'original' })) }],
  scripts: [{ cardId: 10, cardName: 'content content', path: 'script/c10.lua', matches: [
    { field: '', line: 1, column: 1, endColumn: 8, before: '', matched: 'content', after: '', sourceHash: 'script' },
  ] }] });

test('excluding a match or group only changes replacement scope and can be restored', async () => {
  let request: WorkspaceReplaceRequest | undefined;
  const controller = setup(async () => results(), { previewReplace: async input => {
    request = input; return { cards: [], scripts: [], edits: [] };
  } });
  await controller.run();
  const original = get(controller.state).result!;
  controller.exclude(original.cards[0], original.cards[0].matches[0]);
  controller.exclude(original.scripts[0]);
  expect(get(controller.state).excludedCount).toBe(2);
  expect(get(controller.state).result!.scripts).toEqual([]);
  controller.setReplacement('replacement');
  await controller.previewReplace();
  expect(request?.targets).toHaveLength(1);
  const target = request?.targets[0];
  expect([target?.script, target?.cardId, target?.field, target?.column]).toEqual([false, 10, 'name', 9]);
  expect(request?.replacement).toBe('replacement');
  expect(request?.buffers[0].content).toBe('unsaved content');
  controller.restore();
  expect(get(controller.state).result).toBe(original);
  expect(get(controller.state).excludedCount).toBe(0);
  expect(get(controller.state).preview).toBeNull();
  controller.change({ text: 'new' });
  controller.exclude(original.cards[0]);
  expect(get(controller.state).result).toBeNull();
});

test('exclusions and replacement edits invalidate an in-flight preview', async () => {
  let finish!: (preview: WorkspaceReplacePreview) => void;
  const controller = setup(async () => results(), { previewReplace: () => new Promise(resolve => { finish = resolve; }) });
  await controller.run();
  const pending = controller.previewReplace();
  await Promise.resolve();
  controller.exclude(get(controller.state).result!.cards[0]);
  finish({ cards: [], scripts: [], edits: [] });
  await pending;
  expect(get(controller.state).preview).toBeNull();
  expect(get(controller.state).planning).toBe(false);
});

test('replacement refuses previews after the CDB changes and refreshes after a successful apply', async () => {
  let applied = 0;
  const target = { cardId: 10, script: false, ...results().cards[0].matches[0] };
  const controller = setup(async () => results(), {
    previewReplace: async () => ({ cards: [], scripts: [], edits: [{ target, replacement: 'new' }] }),
    applyReplace: async (_preview, current) => { expect(current()).toBe(true); applied++; },
  });
  await controller.run();
  await controller.previewReplace();
  expect(await controller.applyReplace()).toBe(1);
  expect(applied).toBe(1);
  expect(get(controller.state).preview).toBeNull();
  await controller.previewReplace();
  controller.mutate();
  expect(await controller.applyReplace()).toBeNull();
  expect(applied).toBe(1);
  expect(get(controller.state).error).toBe('changed');
});

test('new input and cancellation reject late results and errors', async () => {
  let finish!: (result: WorkspaceSearchResult) => void;
  const controller = setup(() => new Promise((resolve) => { finish = resolve; }));
  const pending = controller.run();
  await Promise.resolve();
  controller.change({ text: 'new query' });
  finish(empty);
  await pending;
  const { text, busy, result, error } = get(controller.state);
  expect({ text, busy, result, error }).toEqual({ text: 'new query', busy: false, result: null, error: '' });
});

test('leaving the workspace or changing its revision cannot publish stale results', async () => {
  for (const action of ['leave', 'mutate'] as const) {
    let finish!: (result: WorkspaceSearchResult) => void;
    const controller = setup(() => new Promise((resolve) => { finish = resolve; }));
    const pending = controller.run();
    await Promise.resolve();
    controller[action]();
    finish(empty);
    await pending;
    expect(get(controller.state).result).toBeNull();
    expect(get(controller.state).error).toBe(action === 'mutate' ? 'changed' : '');
    expect(get(controller.state).busy).toBe(false);
  }
});
