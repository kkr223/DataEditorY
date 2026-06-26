import type { DraftUndoEntry } from '$lib/features/card-editor/controller';
import type { CardDataEntry } from '$lib/types';
import { cloneEditableCard } from '$lib/domain/card/draft';

export type WorkspaceCardDraftSnapshot = {
  draftCard: CardDataEntry;
  originalCardCode: number | null;
  imageSrc: string;
  setcodeHexes: string[];
  lastSyncedSelectedId: number | null;
  lastLoadedCardSnapshot: string;
  lastDefaultCoverSrc: string;
  draftUndoHistory: DraftUndoEntry[];
  trackedDraftSnapshot: string;
  dirty: boolean;
};

export const cardDraftWorkspaceState = $state({
  sessions: {} as Record<string, WorkspaceCardDraftSnapshot>,
});

function cloneUndoHistory(history: DraftUndoEntry[]) {
  return history.map((entry) => ({
    snapshot: entry.snapshot,
    card: cloneEditableCard(entry.card),
  }));
}

export function setWorkspaceCardDraft(sessionId: string, snapshot: WorkspaceCardDraftSnapshot) {
  if (!sessionId) return;
  cardDraftWorkspaceState.sessions[sessionId] = {
    ...snapshot,
    draftCard: cloneEditableCard(snapshot.draftCard),
    setcodeHexes: [...snapshot.setcodeHexes],
    draftUndoHistory: cloneUndoHistory(snapshot.draftUndoHistory),
  };
}

export function getWorkspaceCardDraft(sessionId: string | null | undefined) {
  if (!sessionId) return null;
  return cardDraftWorkspaceState.sessions[sessionId] ?? null;
}

export function getWorkspaceCardDraftCard(sessionId: string | null | undefined) {
  return getWorkspaceCardDraft(sessionId)?.draftCard ?? null;
}

export function hasWorkspaceCardDraftUndo(sessionId: string | null | undefined) {
  return (getWorkspaceCardDraft(sessionId)?.draftUndoHistory.length ?? 0) > 1;
}

export function clearWorkspaceCardDraft(sessionId: string) {
  delete cardDraftWorkspaceState.sessions[sessionId];
}
