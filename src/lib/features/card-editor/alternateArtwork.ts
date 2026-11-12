import { get } from 'svelte/store';
import { _ } from 'svelte-i18n';
import { activeTabId, modifyCardsInTab, queryCardByIdInTab, refreshSearchAfterMutation } from '#lib/stores/db.ts';
import { editorState, handleSearch } from '#lib/stores/editor.svelte.ts';
import { cloneCard } from '#lib/stores/cardUtils.ts';
import { showToast } from '#lib/stores/toast.svelte.ts';
import { commitWorkspaceCardDraft, getWorkspaceCardDraft } from '#lib/modules/card/workbench/cardDraftWorkspaceState.svelte.ts';
import { writeErrorLog } from '#lib/utils/errorLog.ts';
import { navigateToCard } from './cardNavigation';

const pendingWorkspaces = new Set<string>();

export async function handleCreateAlternateArtwork() {
  const tabId = get(activeTabId);
  const selectedId = editorState.selectedId;
  if (!tabId || selectedId === null) {
    showToast(get(_)('editor.no_card_selected'), 'info');
    return;
  }
  if (pendingWorkspaces.has(tabId)) return;

  const draft = getWorkspaceCardDraft(tabId);
  const sourceCode = draft?.originalCardCode === selectedId ? Number(draft.draftCard.code) : selectedId;
  const isCurrentCard = () => get(activeTabId) === tabId
    && (editorState.selectedId === selectedId || editorState.selectedId === sourceCode);
  pendingWorkspaces.add(tabId);
  try {
    if (!await commitWorkspaceCardDraft(tabId) || !isCurrentCard()) return;
    const source = await queryCardByIdInTab(tabId, sourceCode);
    if (!isCurrentCard()) return;
    if (!source) throw new Error(`Source card ${sourceCode} is missing`);

    for (let offset = 1; offset <= 10; offset++) {
      const code = source.code + offset;
      if (code > 0xffffffff) break;
      const existing = await queryCardByIdInTab(tabId, code);
      if (!isCurrentCard()) return;
      if (existing) continue;

      const card = { ...cloneCard(source), code, alias: source.code };
      const saved = await modifyCardsInTab(tabId, [card], false, [null]);
      if (!saved) throw new Error(`Failed to create alternate artwork at ${code}`);
      await refreshSearchAfterMutation(tabId, () => handleSearch(true));
      if (isCurrentCard()) await navigateToCard(tabId, code, 'card');
      showToast(get(_)('editor.alternate_artwork_created', { values: { code: String(code) } }), 'success');
      return;
    }
    showToast(get(_)('editor.alternate_artwork_no_slot'), 'info');
  } catch (error) {
    void writeErrorLog({ source: 'card-editor.alternate-artwork', error, extra: { tabId, sourceCode } });
    showToast(get(_)('editor.alternate_artwork_failed'), 'error');
  } finally {
    pendingWorkspaces.delete(tabId);
  }
}
