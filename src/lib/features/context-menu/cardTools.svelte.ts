import { get } from 'svelte/store';
import { activeTabId } from '#lib/stores/db.ts';
import { getSelectedCardIds } from '#lib/stores/editor.svelte.ts';

export type CardToolRequest = {
  id: string;
  tabId: string;
  cardIds: number[];
  kind: 'batch' | 'showcase';
  groupId?: string;
};

export const cardToolState = $state<{ request: CardToolRequest | null }>({ request: null });

function openCardTool(kind: CardToolRequest['kind'], groupId?: string) {
  const tabId = get(activeTabId);
  if (!tabId) return;
  cardToolState.request = {
    id: `${kind}:${Date.now()}:${Math.random().toString(16).slice(2)}`,
    tabId,
    cardIds: getSelectedCardIds(),
    kind,
    groupId,
  };
}

/** Single owner of the batch-edit dialog; every entry point routes here. */
export function openBatchCdbEditTool(groupId?: string) {
  openCardTool('batch', groupId);
}
