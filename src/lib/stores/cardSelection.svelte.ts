import { cacheActiveTabSelection } from '$lib/stores/db';
import {
  getAllCards,
  getCardById,
  getCardIndex,
  getVisibleCardIds,
  hasVisibleCard,
} from '$lib/stores/searchStore.svelte';
import type { CardDataEntry } from '$lib/types';

export const cardSelectionState = $state<{
  selectedId: number | null;
  selectedIds: number[];
  selectionAnchorId: number | null;
}>({
  selectedId: null,
  selectedIds: [],
  selectionAnchorId: null,
});

function applySelection(ids: number[], primaryId: number | null = null, anchorId: number | null = null): number[] {
  const visibleIds = getVisibleCardIds(ids);
  const visibleIdSet = new Set(visibleIds);
  const nextPrimaryId =
    primaryId !== null && visibleIdSet.has(primaryId)
      ? primaryId
      : visibleIds[0] ?? null;
  const nextAnchorId =
    anchorId !== null && visibleIdSet.has(anchorId)
      ? anchorId
      : nextPrimaryId;

  cardSelectionState.selectedIds = visibleIds;
  cardSelectionState.selectedId = nextPrimaryId;
  cardSelectionState.selectionAnchorId = nextAnchorId;
  cacheActiveTabSelection(visibleIds, nextPrimaryId, nextAnchorId);

  return visibleIds;
}

export function getSelectedCard(): CardDataEntry | null {
  return getCardById(cardSelectionState.selectedId) ?? null;
}

export function getSelectedCards(): CardDataEntry[] {
  return getVisibleCardIds(cardSelectionState.selectedIds)
    .map((id) => getCardById(id))
    .filter((card): card is CardDataEntry => card !== undefined);
}

export function getSelectedCardIds(): number[] {
  return [...cardSelectionState.selectedIds];
}

export function clearSelection() {
  cardSelectionState.selectedIds = [];
  cardSelectionState.selectedId = null;
  cardSelectionState.selectionAnchorId = null;
  cacheActiveTabSelection([], null, null);
}

export function setSingleSelectedCard(cardId: number | null) {
  if (cardId === null || !hasVisibleCard(cardId)) {
    clearSelection();
    return;
  }

  applySelection([cardId], cardId, cardId);
}

export function setSelectedCards(cardIds: number[], primaryId: number | null = null, anchorId: number | null = null): number[] {
  return applySelection(cardIds, primaryId, anchorId);
}

export function toggleCardSelection(cardId: number) {
  if (!hasVisibleCard(cardId)) return;

  if (cardSelectionState.selectedIds.includes(cardId)) {
    const remaining = cardSelectionState.selectedIds.filter((id) => id !== cardId);
    applySelection(
      remaining,
      cardSelectionState.selectedId === cardId ? remaining[remaining.length - 1] ?? null : cardSelectionState.selectedId,
      cardSelectionState.selectionAnchorId === cardId ? remaining[remaining.length - 1] ?? null : cardSelectionState.selectionAnchorId
    );
    return;
  }

  applySelection([...cardSelectionState.selectedIds, cardId], cardId, cardId);
}

export function selectCardRange(cardId: number, preserveExisting = false) {
  if (!hasVisibleCard(cardId)) return;

  const anchorId = cardSelectionState.selectionAnchorId ?? cardSelectionState.selectedId ?? cardId;
  const anchorIndex = getCardIndex(anchorId);
  const targetIndex = getCardIndex(cardId);

  if (anchorIndex === -1 || targetIndex === -1) {
    setSingleSelectedCard(cardId);
    return;
  }

  const [start, end] = anchorIndex < targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex];
  const rangeIds = getAllCards().slice(start, end + 1).map((card) => card.code);
  const nextIds = preserveExisting ? [...cardSelectionState.selectedIds, ...rangeIds] : rangeIds;
  applySelection(nextIds, cardId, anchorId);
}
