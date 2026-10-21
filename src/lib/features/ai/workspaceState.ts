import type { WorkspaceMetadata } from '$lib/native/metadataApi';
import { workspaceMetadataState, updateWorkspaceMetadata, updateWorkspaceMetadataForPath } from '$lib/features/workspace-metadata/state.svelte';
import type { AiProposalStatusUpdate, WorkspaceAiContextRef, WorkspaceAiMessage, WorkspaceAiProposal, WorkspaceAiThread, WorkspaceAiToolRun } from './types';

function createAiRecordId(prefix: string) {
  const randomId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}:${randomId}`;
}

function readAiState(metadata: WorkspaceMetadata | null) {
  const ai = metadata?.ai && typeof metadata.ai === 'object' ? metadata.ai : {};
  const threads = Array.isArray(ai.threads)
    ? (ai.threads as WorkspaceAiThread[]).map((thread) => ({
        ...thread,
        messages: Array.isArray(thread.messages) ? thread.messages : [],
        contextRefs: Array.isArray(thread.contextRefs) ? thread.contextRefs : [],
        toolRuns: Array.isArray(thread.toolRuns) ? thread.toolRuns : [],
        proposalIds: Array.isArray(thread.proposalIds) ? thread.proposalIds : [],
      }))
    : [];
  const proposals = Array.isArray(ai.proposals) ? ai.proposals as WorkspaceAiProposal[] : [];
  const activeThreadId = typeof ai.activeThreadId === 'string' ? ai.activeThreadId : threads[0]?.id ?? null;
  return { ai, threads, proposals, activeThreadId };
}

export function getAiThreads() {
  return readAiState(workspaceMetadataState.metadata).threads;
}

export function getActiveAiThread() {
  const { threads, activeThreadId } = readAiState(workspaceMetadataState.metadata);
  return threads.find((thread) => thread.id === activeThreadId) ?? threads[0] ?? null;
}

export function getAiProposals() {
  return readAiState(workspaceMetadataState.metadata).proposals;
}

export function getAiProposalsForThread(threadId: string) {
  return getAiProposals().filter((proposal) => proposal.threadId === threadId);
}

export function upsertAiThread(input: Partial<WorkspaceAiThread> & {
  title: string;
  contextRefs?: WorkspaceAiContextRef[];
}) {
  const now = Date.now();
  const previous = input.id ? getAiThreads().find(thread => thread.id === input.id) : undefined;
  const thread: WorkspaceAiThread = {
    id: input.id ?? createAiRecordId('ai-thread'),
    title: input.title,
    scope: input.scope ?? previous?.scope ?? 'cdb',
    messages: input.messages ?? previous?.messages ?? [],
    contextRefs: input.contextRefs ?? previous?.contextRefs ?? [],
    toolRuns: input.toolRuns ?? previous?.toolRuns ?? [],
    proposalIds: input.proposalIds ?? previous?.proposalIds ?? [],
    createdAt: input.createdAt ?? previous?.createdAt ?? now,
    updatedAt: now,
    tokenUsage: input.tokenUsage ?? previous?.tokenUsage,
  };

  updateWorkspaceMetadata((metadata) => {
    const { ai, threads } = readAiState(metadata);
    const exists = threads.some((item) => item.id === thread.id);
    return {
      ...metadata,
      ai: {
        ...ai,
        activeThreadId: thread.id,
        threads: exists
          ? threads.map((item) => (item.id === thread.id ? thread : item))
          : [thread, ...threads],
      },
    };
  });

  return thread;
}

export function deleteAiThread(threadId: string) {
  updateWorkspaceMetadata((metadata) => {
    const { ai, threads, proposals } = readAiState(metadata);
    const nextThreads = threads.filter((thread) => thread.id !== threadId);
    return {
      ...metadata,
      ai: {
        ...ai,
        activeThreadId: nextThreads[0]?.id ?? null,
        threads: nextThreads,
        proposals: proposals.filter((proposal) => proposal.threadId !== threadId),
      },
    };
  });
}

export function accumulateAiThreadTokenUsage(input: {
  threadId: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}) {
  updateWorkspaceMetadata((metadata) => {
    const { ai, threads } = readAiState(metadata);
    return {
      ...metadata,
      ai: {
        ...ai,
        threads: threads.map((thread) => {
          if (thread.id !== input.threadId) return thread;
          const prev = thread.tokenUsage ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
          return {
            ...thread,
            tokenUsage: {
              promptTokens: prev.promptTokens + input.promptTokens,
              completionTokens: prev.completionTokens + input.completionTokens,
              totalTokens: prev.totalTokens + input.totalTokens,
            },
            updatedAt: Date.now(),
          };
        }),
      },
    };
  });
}

export function resetAiThreadTokenUsage(threadId: string) {
  updateWorkspaceMetadata((metadata) => {
    const { ai, threads } = readAiState(metadata);
    return {
      ...metadata,
      ai: {
        ...ai,
        threads: threads.map((thread) => thread.id !== threadId ? thread : {
          ...thread,
          tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          updatedAt: Date.now(),
        }),
      },
    };
  });
}

export function appendAiMessage(input: {
  threadId: string;
  role: WorkspaceAiMessage['role'];
  content: string;
  contextRefs?: WorkspaceAiContextRef[];
  model?: string;
}) {
  const content = input.content.trim();
  if (!content) return;

  const now = Date.now();
  const message: WorkspaceAiMessage = {
    id: createAiRecordId('ai-message'),
    role: input.role,
    content,
    createdAt: now,
    model: input.model,
  };

  updateWorkspaceMetadata((metadata) => {
    const { ai, threads } = readAiState(metadata);
    return {
      ...metadata,
      ai: {
        ...ai,
        activeThreadId: input.threadId,
        threads: threads.map((thread) => thread.id === input.threadId
          ? {
              ...thread,
              messages: [...thread.messages, message],
              contextRefs: input.contextRefs ?? thread.contextRefs,
              updatedAt: now,
            }
          : thread),
      },
    };
  });
}

export function compactAiThreadMessages(input: {
  threadId: string;
  summary: string;
  keepLast: number;
  model?: string;
}) {
  const summary = input.summary.trim();
  if (!summary) return;

  const now = Date.now();
  const keepLast = Math.max(1, Math.floor(input.keepLast));
  const compactedMessage: WorkspaceAiMessage = {
    id: createAiRecordId('ai-message'),
    role: 'system',
    content: summary,
    createdAt: now,
    model: input.model,
  };

  updateWorkspaceMetadata((metadata) => {
    const { ai, threads } = readAiState(metadata);
    return {
      ...metadata,
      ai: {
        ...ai,
        activeThreadId: input.threadId,
        threads: threads.map((thread) => {
          if (thread.id !== input.threadId || thread.messages.length <= keepLast + 1) return thread;
          return {
            ...thread,
            messages: [compactedMessage, ...thread.messages.slice(-keepLast)],
            updatedAt: now,
          };
        }),
      },
    };
  });
}

export function upsertAiToolRun(input: WorkspaceAiToolRun & { threadId: string }) {
  updateWorkspaceMetadata((metadata) => {
    const { ai, threads } = readAiState(metadata);
    return {
      ...metadata,
      ai: {
        ...ai,
        activeThreadId: input.threadId,
        threads: threads.map((thread) => thread.id === input.threadId
          ? {
              ...thread,
              toolRuns: thread.toolRuns.some((tool) => tool.id === input.id)
                ? thread.toolRuns.map((tool) => (tool.id === input.id ? input : tool))
                : [...thread.toolRuns, input],
              updatedAt: Date.now(),
            }
          : thread),
      },
    };
  });
}

export function addAiProposal(input: WorkspaceAiProposal) {
  updateWorkspaceMetadata((metadata) => {
    const { ai, threads, proposals } = readAiState(metadata);
    return {
      ...metadata,
      ai: {
        ...ai,
        activeThreadId: input.threadId,
        proposals: [input, ...proposals.filter((proposal) => proposal.id !== input.id)],
        threads: threads.map((thread) => thread.id === input.threadId
          ? {
              ...thread,
              proposalIds: [input.id, ...thread.proposalIds.filter((id) => id !== input.id)],
              updatedAt: Date.now(),
            }
          : thread),
      },
    };
  });
}

export function updateAiProposalStatus(input: AiProposalStatusUpdate, cdbPath?: string) {
  const mutate = (metadata: WorkspaceMetadata): WorkspaceMetadata => {
    const { ai, threads, proposals } = readAiState(metadata);
    const now = Date.now();
    return {
      ...metadata,
      ai: {
        ...ai,
        activeThreadId: input.threadId,
        proposals: proposals.map((proposal) => proposal.id === input.proposalId
          ? {
              ...proposal,
              status: input.status,
              appliedAt: input.status === 'applied' || input.status === 'partially_applied' ? now : proposal.appliedAt,
              applyLog: input.applyLog ?? proposal.applyLog,
            }
          : proposal),
        threads: threads.map((thread) => thread.id === input.threadId
          ? {
              ...thread,
              updatedAt: now,
            }
          : thread),
      },
    };
  };
  if (cdbPath) return updateWorkspaceMetadataForPath(cdbPath, mutate);
  updateWorkspaceMetadata(mutate);
}
