import type { CardDataEntry } from '$lib/types';

export type PendingAiCardDraftPatch = {
  id: string;
  workspaceId: string;
  cardCode: number;
  revision: number;
  patch: Partial<CardDataEntry>;
  createdAt: number;
};

export const aiProposalApplicationState = $state({
  pendingCardDraftPatch: null as PendingAiCardDraftPatch | null,
});

export function queueAiCardDraftPatch(input: Omit<PendingAiCardDraftPatch, 'createdAt'>) {
  aiProposalApplicationState.pendingCardDraftPatch = {
    ...input,
    createdAt: Date.now(),
  };
}

export function consumeAiCardDraftPatch(id: string, target: {
  workspaceId: string; cardCode: number; revision: number;
}) {
  if (aiProposalApplicationState.pendingCardDraftPatch?.id !== id) return null;
  const pending = aiProposalApplicationState.pendingCardDraftPatch;
  aiProposalApplicationState.pendingCardDraftPatch = null;
  if (pending.workspaceId !== target.workspaceId || pending.cardCode !== target.cardCode
    || pending.revision !== target.revision) return null;
  return pending;
}
