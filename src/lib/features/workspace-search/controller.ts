import { get, writable } from 'svelte/store';
import type { WorkspaceSearchOptions, WorkspaceSearchRequest, WorkspaceSearchResult } from './types';

export const createWorkspaceSearchController = (deps: {
  isCurrent: () => boolean;
  commitDraft: () => Promise<boolean>;
  query: (request: WorkspaceSearchRequest) => Promise<WorkspaceSearchResult>;
  getBuffers: () => WorkspaceSearchRequest['buffers'];
  getRevision: () => number;
}) => {
  const state = writable({
    text: '', caseSensitive: false, regex: false, searchCards: true, searchScripts: true,
    busy: false, error: '', result: null as WorkspaceSearchResult | null,
  });
  let generation = 0;
  const cancel = () => { generation++; state.update((value) => ({ ...value, busy: false })); };
  const change = (patch: Partial<WorkspaceSearchOptions>) => {
    cancel();
    state.update((value) => ({ ...value, ...patch, result: null, error: '' }));
  };
  const run = async () => {
    const { text, caseSensitive, regex, searchCards, searchScripts } = get(state);
    if (!text || (!searchCards && !searchScripts)) return;
    const sequence = ++generation;
    const current = () => sequence === generation && deps.isCurrent();
    state.update((value) => ({ ...value, busy: true, error: '', result: null }));
    try {
      if (!await deps.commitDraft()) throw new Error('draftBlocked');
      if (!current()) return;
      const revision = deps.getRevision();
      const result = await deps.query({ text, caseSensitive, regex, searchCards, searchScripts, buffers: deps.getBuffers() });
      if (!current()) return;
      if (revision !== deps.getRevision()) throw new Error('changed');
      state.update((value) => ({ ...value, result }));
    } catch (error) {
      if (current()) state.update((value) => ({ ...value, error: error instanceof Error ? error.message : String(error) }));
    } finally {
      if (sequence === generation) state.update((value) => ({ ...value, busy: false }));
    }
  };
  return { state, change, run, cancel };
};
