import { get } from 'svelte/store';
import { _ } from 'svelte-i18n';
import { scriptTabs, openExistingScriptTab, updateScriptTabContent, registerScriptModelDisposer } from '#lib/stores/scriptEditor.svelte.ts';
import { recordUndoLabel } from '#lib/stores/tabs.ts';
import { clearSourceFilterCacheForTab, refreshCachedSearchForTab } from '#lib/stores/search.ts';
import { commitWorkspaceReplaceCards } from '#lib/native/workspaceSearchApi.ts';
import { applyReplacementPlan } from './applyReplacement';
import type { WorkspaceReplacePreview } from './types';

export const applyWorkspaceReplacement = async (
  owner: { id: string; path: string }, preview: WorkspaceReplacePreview, isCurrent: () => boolean,
) => {
  const models = preview.scripts.length ? await import('#lib/features/script-editor/monaco/setup.ts') : null;
  if (models) registerScriptModelDisposer(models.disposeScriptModel);
  await applyReplacementPlan(preview, {
    isCurrent,
    prepareScript: async script => {
      const cardName = preview.cards.find(change => change.after.code === script.cardId)?.after.name ?? script.cardName;
      const id = await openExistingScriptTab({ cdbPath: owner.path, sourceTabId: owner.id,
        cardCode: script.cardId, cardName, scriptPath: script.path, activate: false });
      if (!id) throw new Error('changed');
      return id;
    },
    readBuffer: id => get(scriptTabs).find(tab => tab.id === id)?.content,
    writeBuffer: (id, before, after) => {
      const undoModel = models?.replaceScriptModelContent(id, before, after);
      updateScriptTabContent(id, after);
      return () => { undoModel?.(); updateScriptTabContent(id, before); };
    },
    commitCards: changes => commitWorkspaceReplaceCards(owner.id, changes),
  });
  if (preview.cards.length) {
    recordUndoLabel(owner.id, String(get(_)('workspace_search.replace_title')));
    clearSourceFilterCacheForTab(owner.id);
    await refreshCachedSearchForTab(owner.id);
  }
};
