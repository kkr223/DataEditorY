import type { CardDataEntry } from '$lib/types';

export type PendingAiCardDraftPatch = {
  id: string;
  patch: Partial<CardDataEntry>;
  createdAt: number;
};

export const aiProposalApplicationState = $state({
  pendingCardDraftPatch: null as PendingAiCardDraftPatch | null,
});

export function queueAiCardDraftPatch(input: {
  id: string;
  patch: Partial<CardDataEntry>;
}) {
  aiProposalApplicationState.pendingCardDraftPatch = {
    id: input.id,
    patch: input.patch,
    createdAt: Date.now(),
  };
}

export function consumeAiCardDraftPatch(id: string) {
  if (aiProposalApplicationState.pendingCardDraftPatch?.id !== id) return null;
  const pending = aiProposalApplicationState.pendingCardDraftPatch;
  aiProposalApplicationState.pendingCardDraftPatch = null;
  return pending;
}
