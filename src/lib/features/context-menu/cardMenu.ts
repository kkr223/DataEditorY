import { get } from 'svelte/store';
import { _ } from 'svelte-i18n';
import { activeTab } from '$lib/stores/db';
import { clearSelection, editorState, getAllCards, handleReset, setSelectedCards } from '$lib/stores/editor.svelte';
import { hasCardClipboard, setCardClipboard } from '$lib/stores/cardClipboard.svelte';
import { handleDeleteSelection, handlePasteSelection } from '$lib/features/card-editor/selectionActions';
import { navigateToCard } from '$lib/features/card-editor/cardNavigation';
import { commitWorkspaceCardDraft } from '$lib/modules/card/workbench/cardDraftWorkspaceState.svelte';
import { upsertCardGroup, workspaceMetadataState } from '$lib/modules/card/workbench/workspaceMetadataState.svelte';
import { getCardScriptInfo } from '$lib/native/scriptApi';
import { pathExists, revealFile } from '$lib/native/assetApi';
import { getPicsDir } from '$lib/services/cardImageService';
import { tauriBridge } from '$lib/infrastructure/tauri';
import { documentRuntime } from '$lib/platform/appRuntime';
import { openContextMenu, updateContextMenu, type ContextMenuItem } from './menu.svelte';
import { resolveContextCardIds } from './cardTargets';
import { cardToolState } from './cardTools.svelte';

export function openCardMenu(event: MouseEvent, clickedId?: number) {
  const tab = get(activeTab);
  if (!tab) return;
  const t = (key: string, count?: number) => String(get(_)(`context_menu.${key}`, { values: { count: String(count ?? 0) } }));
  const guard = (action: () => unknown | Promise<unknown>) => async () => {
    if (get(activeTab)?.id === tab.id) await action();
  };
  const commit = async () => (await commitWorkspaceCardDraft(tab.id)) && get(activeTab)?.id === tab.id;
  if (clickedId === undefined) {
    openContextMenu(event, [
      { id: 'paste', label: t('paste_cards'), disabled: !hasCardClipboard(), action: guard(async () => { if (await commit()) await handlePasteSelection(tab.id); }) }, null,
      { id: 'select-page', label: t('select_page'), disabled: !getAllCards().length, action: guard(async () => { if (await commit()) setSelectedCards(getAllCards().map((card) => card.code), editorState.selectedId); }) },
      { id: 'clear-selection', label: t('clear_selection'), disabled: !editorState.selectedIds.length, action: guard(async () => { if (await commit()) clearSelection(); }) },
      { id: 'clear-filters', label: t('clear_filters'), action: guard(async () => { if (await commit()) await handleReset(); }) },
    ]);
    return;
  }
  const ids = resolveContextCardIds(clickedId, editorState.selectedIds);
  const targets = new Set(ids);
  const cards = getAllCards().filter((card) => targets.has(card.code));
  const multiple = ids.length > 1;
  let scriptPath: string | null = null;
  let imagePath: string | null = null;
  const hasMaker = documentRuntime.registry.findWorkbenchContributions('card.workbench', 'surface').some((item) => item.metadata?.surfaceId === 'image');
  const openTool = async (kind: 'batch' | 'showcase') => {
    if (!(await commit())) return;
    let groupId: string | undefined;
    if (kind === 'batch') {
      if (!workspaceMetadataState.ready || workspaceMetadataState.cdbPath !== tab.path) return;
      groupId = upsertCardGroup({ name: t('selected_group', ids.length), cardIds: ids, source: 'selection' }).id;
    }
    cardToolState.request = { id: crypto.randomUUID(), tabId: tab.id, cardIds: ids, kind, groupId };
  };
  const items = (): ContextMenuItem[] => [
    { id: 'names', label: t(multiple ? 'copy_names' : 'copy_name'), action: () => navigator.clipboard.writeText(cards.map((card) => card.name ?? '').join('\n')) },
    { id: 'codes', label: t(multiple ? 'copy_codes' : 'copy_code'), action: () => navigator.clipboard.writeText(cards.map((card) => String(card.code)).join('\n')) },
    { id: 'data', label: t(multiple ? 'copy_cards' : 'copy_data'), action: () => setCardClipboard(cards) }, null,
    ...(multiple ? [
      { id: 'batch', label: t('batch_group'), action: guard(() => openTool('batch')) },
      { id: 'showcase', label: t('showcase'), action: guard(() => openTool('showcase')) },
    ] : [
      { id: 'script', label: t('open_script'), action: guard(() => navigateToCard(tab.id, clickedId, 'script')) },
      { id: 'reveal-script', label: t('reveal_script'), disabled: !scriptPath, action: () => scriptPath && revealFile(scriptPath) },
      ...(hasMaker ? [{ id: 'maker', label: t('open_maker'), action: guard(() => navigateToCard(tab.id, clickedId, 'image')) }] : []),
      { id: 'reveal-image', label: t('reveal_image'), disabled: !imagePath, action: () => imagePath && revealFile(imagePath) },
    ]), null,
    { id: 'delete', label: t(multiple ? 'delete_cards' : 'delete_card', ids.length), danger: true, action: guard(() => handleDeleteSelection(tab.id, ids)) },
  ];
  const token = openContextMenu(event, items());
  if (multiple) return;
  void Promise.allSettled([
    getCardScriptInfo(tab.path, clickedId).then((info) => { if (info.exists) scriptPath = info.path; }),
    getPicsDir(tab.path).then(async (dir) => {
      const path = await tauriBridge.join(dir, `${clickedId}.jpg`);
      if (await pathExists(path)) imagePath = path;
    }),
  ]).then(() => { if (get(activeTab)?.id === tab.id) updateContextMenu(token, items()); });
}
