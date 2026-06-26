import type { CardDataEntry, SearchFilters } from '$lib/types';
import { documentRuntime } from '$lib/platform/appRuntime';
import {
  compileBatchOperationChanges,
  type BatchFieldOperation,
  type BatchOperationGroup,
} from '$lib/domain/card/batchOperations';
import {
  closeTab,
  createCdbFile,
  deleteCardsWithSnapshotInTab,
  getCardByIdInTab,
  getCardsByIdsInTab,
  modifyCardsInTab,
  openCdbPath,
  saveCdbTab,
  saveCdbTabAs,
  searchCardsPageInTab,
  undoLastOperationInTab,
} from '$lib/stores/db';

export type CardPatch = {
  id: number;
  fields: Partial<CardDataEntry>;
};

export type { BatchFieldOperation, BatchOperationGroup } from '$lib/domain/card/batchOperations';

export type BatchOperationPreview = {
  previewId: string;
  targetCount: number;
  changedCount: number;
  sample: CardDataEntry[];
};

const batchPreviewSnapshots = new Map<string, {
  sessionId: string;
  revision: number;
  cards: CardDataEntry[];
}>();

function createPreviewId() {
  return `batch-preview:${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

export async function openCdb(path: string) {
  return openCdbPath(path);
}

export async function createCdb(path?: string) {
  return createCdbFile(path);
}

export async function searchCards(_sessionId: string, query: SearchFilters, page = 1, pageSize = 50) {
  return searchCardsPageInTab(_sessionId, query, page, pageSize);
}

export async function getCard(sessionId: string, id: number) {
  return getCardByIdInTab(sessionId, id);
}

export async function commitCardPatch(sessionId: string, patch: CardPatch) {
  const current = await getCardByIdInTab(sessionId, patch.id);
  if (!current) return false;
  return modifyCardsInTab(sessionId, [{ ...current, ...patch.fields, code: patch.id }]);
}

export async function commitCards(sessionId: string, cards: CardDataEntry[]) {
  return modifyCardsInTab(sessionId, cards);
}

export async function previewBatchOperations(
  sessionId: string,
  groups: BatchOperationGroup[],
  operations: BatchFieldOperation[],
): Promise<BatchOperationPreview> {
  const cardsById = new Map<number, CardDataEntry>();

  for (const group of groups) {
    for (const card of await getCardsByIdsInTab(sessionId, group.cardIds)) {
      cardsById.set(card.code, card);
    }
  }

  const changed = compileBatchOperationChanges([...cardsById.values()], groups, operations);
  const previewId = createPreviewId();
  batchPreviewSnapshots.set(previewId, {
    sessionId,
    revision: documentRuntime.getDocument(sessionId)?.revision ?? -1,
    cards: changed,
  });

  return {
    previewId,
    targetCount: cardsById.size,
    changedCount: changed.length,
    sample: changed.slice(0, 8),
  };
}

export async function applyBatchOperations(sessionId: string, previewId: string) {
  const preview = batchPreviewSnapshots.get(previewId);
  if (!preview || preview.sessionId !== sessionId) {
    throw new Error('Unknown or expired batch preview');
  }

  const currentRevision = documentRuntime.getDocument(sessionId)?.revision ?? -1;
  if (currentRevision !== preview.revision) {
    batchPreviewSnapshots.delete(previewId);
    throw new Error('The CDB changed after this batch preview. Build a new preview before applying.');
  }

  batchPreviewSnapshots.delete(previewId);
  return commitCards(sessionId, preview.cards);
}

export function discardBatchOperationPreview(previewId: string) {
  return batchPreviewSnapshots.delete(previewId);
}

export async function deleteCards(sessionId: string, cardIds: number[], deletedCards: CardDataEntry[] = []) {
  return deleteCardsWithSnapshotInTab(sessionId, cardIds, deletedCards);
}

export async function undo(sessionId: string) {
  return undoLastOperationInTab(sessionId);
}

export async function saveSession(sessionId: string) {
  return saveCdbTab(sessionId);
}

export async function saveSessionAs(sessionId: string, path: string) {
  return saveCdbTabAs(sessionId, path);
}

export async function closeSession(sessionId: string) {
  await closeTab(sessionId);
}
