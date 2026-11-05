import { get, writable } from 'svelte/store';
import { countSearchMatches, excludeSearchResult, replacementTargets } from './results';
import type { WorkspaceReplacePreview, WorkspaceReplaceRequest, WorkspaceSearchGroup, WorkspaceSearchMatch, WorkspaceSearchOptions, WorkspaceSearchRequest, WorkspaceSearchResult } from './types';

export const createWorkspaceSearchController = (deps: {
  isCurrent: () => boolean;
  commitDraft: () => Promise<boolean>;
  query: (request: WorkspaceSearchRequest) => Promise<WorkspaceSearchResult>;
  getBuffers: () => WorkspaceSearchRequest['buffers'];
  getRevision: () => number;
  previewReplace: (request: WorkspaceReplaceRequest) => Promise<WorkspaceReplacePreview>;
  applyReplace: (preview: WorkspaceReplacePreview, isCurrent: () => boolean) => Promise<void>;
}) => {
  const state = writable({
    text: '', caseSensitive: false, regex: false, searchCards: true, searchScripts: true,
    busy: false, error: '', result: null as WorkspaceSearchResult | null,
    replacement: '', planning: false, applying: false, excludedCount: 0,
    preview: null as WorkspaceReplacePreview | null,
  });
  let generation = 0;
  let previewGeneration = 0;
  let searchRevision = -1;
  let fullResult: WorkspaceSearchResult | null = null;
  const invalidatePreview = () => {
    previewGeneration++;
    state.update(value => ({ ...value, preview: null, planning: false }));
  };
  const cancel = () => { generation++; invalidatePreview(); state.update((value) => ({ ...value, busy: false })); };
  const change = (patch: Partial<WorkspaceSearchOptions>) => {
    if (get(state).applying) return;
    cancel();
    fullResult = null;
    state.update((value) => ({ ...value, ...patch, result: null, error: '', excludedCount: 0 }));
  };
  const run = async () => {
    if (get(state).applying) return;
    const { text, caseSensitive, regex, searchCards, searchScripts } = get(state);
    if (!text || (!searchCards && !searchScripts)) return;
    const sequence = ++generation;
    invalidatePreview();
    fullResult = null;
    const current = () => sequence === generation && deps.isCurrent();
    state.update((value) => ({ ...value, busy: true, error: '', result: null, excludedCount: 0 }));
    try {
      if (!await deps.commitDraft()) throw new Error('draftBlocked');
      if (!current()) return;
      const revision = deps.getRevision();
      const result = await deps.query({ text, caseSensitive, regex, searchCards, searchScripts, buffers: deps.getBuffers() });
      if (!current()) return;
      if (revision !== deps.getRevision()) throw new Error('changed');
      searchRevision = revision;
      fullResult = result;
      state.update((value) => ({ ...value, result }));
    } catch (error) {
      if (current()) state.update((value) => ({ ...value, error: error instanceof Error ? error.message : String(error) }));
    } finally {
      if (sequence === generation) state.update((value) => ({ ...value, busy: false }));
    }
  };
  const setReplacement = (replacement: string) => {
    if (get(state).applying) return;
    invalidatePreview();
    state.update(value => ({ ...value, replacement, error: '' }));
  };
  const exclude = (group: WorkspaceSearchGroup, match?: WorkspaceSearchMatch) => {
    const value = get(state);
    if (!value.result || value.applying || value.busy) return;
    const result = excludeSearchResult(value.result, group, match);
    if (result === value.result) return;
    invalidatePreview();
    state.update(value => ({ ...value, result, error: '',
      excludedCount: countSearchMatches(fullResult) - countSearchMatches(result) }));
  };
  const restore = () => {
    if (get(state).applying || !fullResult) return;
    invalidatePreview();
    state.update(value => ({ ...value, result: fullResult, excludedCount: 0, error: '' }));
  };
  const previewReplace = async () => {
    const value = get(state);
    if (!value.result || !countSearchMatches(value.result) || value.busy || value.applying) return;
    const sequence = ++previewGeneration;
    const current = () => sequence === previewGeneration && deps.isCurrent() && get(state).result === value.result;
    state.update(value => ({ ...value, planning: true, preview: null, error: '' }));
    try {
      if (!(await deps.commitDraft())) throw new Error('draftBlocked');
      if (!current()) return;
      if (deps.getRevision() !== searchRevision) throw new Error('changed');
      const preview = await deps.previewReplace({ text: value.text, regex: value.regex,
        caseSensitive: value.caseSensitive, replacement: value.replacement,
        targets: replacementTargets(value.result), buffers: deps.getBuffers() });
      if (!current()) return;
      if (deps.getRevision() !== searchRevision) throw new Error('changed');
      state.update(value => ({ ...value, preview }));
    } catch (error) {
      if (current()) state.update(value => ({ ...value, error: error instanceof Error ? error.message : String(error) }));
    } finally {
      if (sequence === previewGeneration) state.update(value => ({ ...value, planning: false }));
    }
  };
  const applyReplace = async (): Promise<number | null> => {
    const { preview, applying } = get(state);
    if (!preview?.edits.length || applying) return null;
    const sequence = previewGeneration;
    const current = () => deps.isCurrent() && sequence === previewGeneration
      && deps.getRevision() === searchRevision && get(state).preview === preview;
    state.update(value => ({ ...value, applying: true, error: '' }));
    try {
      if (!(await deps.commitDraft())) throw new Error('draftBlocked');
      if (!current()) throw new Error('changed');
      await deps.applyReplace(preview, current);
      fullResult = null;
      invalidatePreview();
      state.update(value => ({ ...value, result: null, excludedCount: 0 }));
    } catch (error) {
      state.update(value => ({ ...value, preview: null, error: error instanceof Error ? error.message : String(error) }));
      return null;
    } finally {
      state.update(value => ({ ...value, applying: false }));
    }
    if (deps.isCurrent()) await run();
    return preview.edits.length;
  };
  return { state, change, run, cancel, setReplacement, exclude, restore, previewReplace, applyReplace };
};
