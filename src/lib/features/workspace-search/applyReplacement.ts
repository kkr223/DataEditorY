import type { WorkspaceReplacePreview } from './types';

// All asynchronous reads happen before changing buffers. Card updates use the
// document host's atomic compare-and-swap; a failed commit restores untouched buffers.
export const applyReplacementPlan = async (preview: WorkspaceReplacePreview, deps: {
  isCurrent: () => boolean;
  prepareScript: (script: WorkspaceReplacePreview['scripts'][number]) => Promise<string>;
  readBuffer: (id: string) => string | undefined;
  writeBuffer: (id: string, before: string, after: string) => () => void;
  commitCards: (changes: WorkspaceReplacePreview['cards']) => Promise<unknown>;
}) => {
  const prepared: Array<{ id: string; before: string; after: string }> = [];
  for (const script of preview.scripts) {
    if (!deps.isCurrent()) throw new Error('changed');
    const id = await deps.prepareScript(script);
    prepared.push({ id, before: script.before, after: script.after });
  }
  if (!deps.isCurrent() || prepared.some(script => deps.readBuffer(script.id) !== script.before)) {
    throw new Error('changed');
  }
  const written: Array<{ id: string; after: string; rollback: () => void }> = [];
  try {
    for (const script of prepared) {
      const rollback = deps.writeBuffer(script.id, script.before, script.after);
      written.push({ id: script.id, after: script.after, rollback });
    }
    if (preview.cards.length) await deps.commitCards(preview.cards);
  } catch (error) {
    let conflict = false;
    for (const script of written.reverse()) {
      if (deps.readBuffer(script.id) !== script.after) { conflict = true; continue; }
      try { script.rollback(); } catch { conflict = true; }
    }
    if (conflict) throw new Error('replacementPartial');
    throw error;
  }
};
