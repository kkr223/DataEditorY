import type { AiProposalStatusUpdate, WorkspaceAiPatch, WorkspaceAiProposal } from './types';

type ProposalApplicationRequest = {
  proposal: WorkspaceAiProposal;
  singlePatch?: WorkspaceAiPatch;
  ownerPath: string;
  fullAccess: boolean;
};

type ProposalApplicationAccess = {
  applyPatch: (patch: WorkspaceAiPatch) => Promise<void>;
  updateStatus: (update: AiProposalStatusUpdate, ownerPath: string) => void | Promise<void>;
};

export function createAiProposalApplier(access: ProposalApplicationAccess) {
  let applying = false;

  async function apply(request: ProposalApplicationRequest) {
    if (applying) return null;
    applying = true;
    // Capture ownership and authorization before any asynchronous patch work.
    const { proposal, singlePatch, ownerPath, fullAccess } = request;
    const patches = singlePatch ? [singlePatch] : proposal.patches;
    const log: NonNullable<WorkspaceAiProposal['applyLog']> = [...(proposal.applyLog ?? [])];
    let applied = 0;

    const recordStatus = (status: WorkspaceAiProposal['status']) => access.updateStatus({
      threadId: proposal.threadId,
      proposalId: proposal.id,
      status,
      applyLog: log,
    }, ownerPath);

    try {
      for (const patch of patches) {
        try {
          await access.applyPatch(patch);
          applied += 1;
          log.push({ patchId: patch.id, ok: true, message: 'applied', usedFullAccess: fullAccess, createdAt: Date.now() });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          log.push({ patchId: patch.id, ok: false, message, usedFullAccess: fullAccess, createdAt: Date.now() });
          await recordStatus(applied > 0 ? 'partially_applied' : 'failed');
          return { ok: false, message };
        }
      }

      await recordStatus(singlePatch || applied < proposal.patches.length ? 'partially_applied' : 'applied');
      return { ok: true, message: 'applied' };
    } finally {
      applying = false;
    }
  }

  return { apply };
}
