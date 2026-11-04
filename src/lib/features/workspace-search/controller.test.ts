import { expect, test } from 'bun:test';
import { get } from 'svelte/store';
import { createWorkspaceSearchController } from './controller';
import type { WorkspaceSearchRequest, WorkspaceSearchResult } from './types';

const empty: WorkspaceSearchResult = { cards: [], scripts: [], limited: false, warnings: [] };
const setup = (query: (request: WorkspaceSearchRequest) => Promise<WorkspaceSearchResult>) => {
  let active = true;
  let revision = 1;
  let valid = true;
  const controller = createWorkspaceSearchController({
    query, isCurrent: () => active, getRevision: () => revision,
    commitDraft: async () => valid,
    getBuffers: () => [{ cardId: 10, content: 'unsaved content' }],
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
