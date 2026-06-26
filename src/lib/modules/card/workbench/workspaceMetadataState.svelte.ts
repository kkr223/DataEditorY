import type { CardImageConfigDocument } from '$lib/features/card-image/layout';
import type { SearchFilters } from '$lib/types';
import {
  loadWorkspaceMetadata,
  saveWorkspaceMetadata,
  type WorkspaceMetadata,
} from '$lib/native/metadataApi';

const METADATA_SAVE_DELAY_MS = 700;

export const workspaceMetadataState = $state({
  cdbPath: '',
  metadata: null as WorkspaceMetadata | null,
  ready: false,
});

export type WorkspaceAiMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'event';
  content: string;
  createdAt: number;
  model?: string;
};

export type WorkspaceAiContextRef = {
  type: 'cdb' | 'card' | 'selection' | 'script' | 'image';
  label: string;
  value?: unknown;
};

export type WorkspaceAiToolRun = {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  input?: unknown;
  outputSummary?: string;
  keyIds?: Array<string | number>;
  createdAt: number;
};

export type WorkspaceAiPatch =
  | {
      id: string;
      kind: 'card';
      documentId: string;
      cdbPath: string;
      cardCode: number;
      before: unknown;
      patch: unknown;
      after: unknown;
    }
  | {
      id: string;
      kind: 'batch-card';
      documentId: string;
      cdbPath: string;
      summary: unknown;
      cards: Array<{
        cardCode: number;
        before: unknown;
        patch: unknown;
        after: unknown;
      }>;
    }
  | {
      id: string;
      kind: 'script';
      documentId: string;
      cdbPath: string;
      path: string;
      content: string;
    }
  | {
      id: string;
      kind: 'image';
      documentId: string;
      cdbPath: string;
      cardCode: number;
      patch: unknown;
    };

export type WorkspaceAiProposal = {
  id: string;
  threadId: string;
  title: string;
  summary: string;
  patches: WorkspaceAiPatch[];
  toolRuns: WorkspaceAiToolRun[];
  model?: string;
  createdAt: number;
  status?: 'pending' | 'applied' | 'dismissed' | 'partially_applied' | 'failed';
  appliedAt?: number;
  applyLog?: Array<{
    patchId: string;
    ok: boolean;
    message: string;
    usedFullAccess: boolean;
    createdAt: number;
  }>;
};

export type WorkspaceAiThread = {
  id: string;
  title: string;
  scope: 'workspace' | 'cdb' | 'task';
  messages: WorkspaceAiMessage[];
  contextRefs: WorkspaceAiContextRef[];
  toolRuns: WorkspaceAiToolRun[];
  proposalIds: string[];
  createdAt: number;
  updatedAt: number;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
};

export type WorkspaceCardGroup = {
  id: string;
  name: string;
  cardIds: number[];
  source: 'selection' | 'filter' | 'manual';
  createdAt: number;
  updatedAt: number;
};

export type WorkspaceCardExplorerState = {
  filters?: Partial<SearchFilters>;
  selectedIds?: number[];
  selectedId?: number | null;
  selectionAnchorId?: number | null;
  page?: number;
};

export type WorkspaceScriptSurfaceState = {
  openTabs?: Array<{
    cardCode: number;
    cardName?: string;
    scriptPath?: string;
    viewState?: unknown;
  }>;
  activeCardCode?: number | null;
};

export type WorkspaceTaskHistoryRecord = {
  id: string;
  kind: string;
  label: string;
  summary?: Record<string, unknown>;
  createdAt: number;
};

let loadSequence = 0;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function cancelScheduledMetadataSave() {
  if (!saveTimer) return;
  clearTimeout(saveTimer);
  saveTimer = null;
}

function scheduleMetadataSave() {
  const path = workspaceMetadataState.cdbPath;
  const metadata = workspaceMetadataState.metadata;
  if (!path || !metadata || !workspaceMetadataState.ready) return;

  cancelScheduledMetadataSave();

  saveTimer = setTimeout(() => {
    saveTimer = null;
    void saveWorkspaceMetadata(path, metadata)
      .then((saved) => {
        if (workspaceMetadataState.cdbPath !== path) return;
        workspaceMetadataState.metadata = saved;
      })
      .catch((error) => {
        console.error('Failed to save workspace metadata', error);
      });
  }, METADATA_SAVE_DELAY_MS);
}

export function loadWorkspaceMetadataForPath(path: string) {
  const normalizedPath = path.trim();
  const sequence = ++loadSequence;
  workspaceMetadataState.cdbPath = normalizedPath;
  workspaceMetadataState.metadata = null;
  workspaceMetadataState.ready = false;

  if (!normalizedPath) return;

  void loadWorkspaceMetadata(normalizedPath)
    .then((metadata) => {
      if (sequence !== loadSequence) return;
      workspaceMetadataState.metadata = metadata;
      workspaceMetadataState.ready = true;
    })
    .catch((error) => {
      if (sequence !== loadSequence) return;
      console.error('Failed to load workspace metadata', error);
      workspaceMetadataState.metadata = { version: 1, cdbPath: normalizedPath };
      workspaceMetadataState.ready = true;
    });
}

export async function copyWorkspaceMetadataForSaveAs(sourcePath: string, destinationPath: string) {
  const source = sourcePath.trim();
  const destination = destinationPath.trim();
  if (!source || !destination || source === destination) return;

  const hasLoadedSource = workspaceMetadataState.ready
    && workspaceMetadataState.cdbPath === source
    && workspaceMetadataState.metadata;
  const metadata = hasLoadedSource
    ? workspaceMetadataState.metadata as WorkspaceMetadata
    : await loadWorkspaceMetadata(source);

  if (hasLoadedSource) {
    cancelScheduledMetadataSave();
    const savedSource = await saveWorkspaceMetadata(source, metadata);
    if (workspaceMetadataState.cdbPath === source) {
      workspaceMetadataState.metadata = savedSource;
    }
  }

  await saveWorkspaceMetadata(destination, {
    ...metadata,
    cdbPath: destination,
  });
}

export function updateWorkspaceMetadata(
  mutate: (metadata: WorkspaceMetadata) => WorkspaceMetadata,
) {
  const path = workspaceMetadataState.cdbPath;
  if (!path || !workspaceMetadataState.ready) return;

  const base = workspaceMetadataState.metadata ?? { version: 1, cdbPath: path };
  workspaceMetadataState.metadata = mutate(base);
  scheduleMetadataSave();
}

export function getCardWorkspaceUi() {
  const ui = workspaceMetadataState.metadata?.ui;
  if (!ui || typeof ui !== 'object') return null;
  const value = ui.cardWorkspace;
  return value && typeof value === 'object'
    ? value as { activeSurface?: unknown; explorerPinned?: unknown }
    : null;
}

export function setCardWorkspaceUi(input: {
  activeSurface: string;
  explorerPinned: boolean;
}) {
  updateWorkspaceMetadata((metadata) => ({
    ...metadata,
    ui: {
      ...(metadata.ui ?? {}),
      cardWorkspace: {
        activeSurface: input.activeSurface,
        explorerPinned: input.explorerPinned,
      },
    },
  }));
}

export function getCardExplorerState() {
  const ui = workspaceMetadataState.metadata?.ui;
  const explorer = ui && typeof ui === 'object'
    ? ui.cardExplorer
    : null;
  return explorer && typeof explorer === 'object'
    ? explorer as WorkspaceCardExplorerState
    : null;
}

export function setCardExplorerState(input: WorkspaceCardExplorerState) {
  updateWorkspaceMetadata((metadata) => ({
    ...metadata,
    ui: {
      ...(metadata.ui ?? {}),
      cardExplorer: {
        filters: input.filters ?? {},
        selectedIds: normalizeCardIds(input.selectedIds ?? []),
        selectedId: Number.isInteger(input.selectedId) ? input.selectedId : null,
        selectionAnchorId: Number.isInteger(input.selectionAnchorId) ? input.selectionAnchorId : null,
        page: Number.isInteger(input.page) && Number(input.page) > 0 ? input.page : 1,
      },
    },
  }));
}

export function getScriptSurfaceState() {
  const scripts = workspaceMetadataState.metadata?.scripts;
  const surface = scripts && typeof scripts === 'object'
    ? scripts.surface
    : null;
  return surface && typeof surface === 'object'
    ? surface as WorkspaceScriptSurfaceState
    : null;
}

export function setScriptSurfaceState(input: WorkspaceScriptSurfaceState) {
  updateWorkspaceMetadata((metadata) => ({
    ...metadata,
    scripts: {
      ...(metadata.scripts ?? {}),
      surface: {
        openTabs: (input.openTabs ?? [])
          .filter((tab) => Number.isInteger(tab.cardCode) && tab.cardCode > 0)
          .map((tab) => ({
            cardCode: tab.cardCode,
            cardName: tab.cardName ?? '',
            scriptPath: tab.scriptPath ?? '',
            viewState: tab.viewState ?? null,
          })),
        activeCardCode: Number.isInteger(input.activeCardCode) ? input.activeCardCode : null,
      },
    },
  }));
}

export function getCardImageDocument(cardCode: number) {
  const image = workspaceMetadataState.metadata?.image;
  const perCard = image && typeof image === 'object'
    ? (image.perCard as Record<string, unknown> | undefined)
    : undefined;
  const document = perCard?.[String(cardCode)];
  return document && typeof document === 'object'
    ? document as CardImageConfigDocument
    : null;
}

export function setCardImageDocument(cardCode: number, document: CardImageConfigDocument) {
  updateWorkspaceMetadata((metadata) => {
    const image = metadata.image && typeof metadata.image === 'object'
      ? metadata.image
      : {};
    const perCard = image.perCard && typeof image.perCard === 'object'
      ? image.perCard as Record<string, unknown>
      : {};
    return {
      ...metadata,
      image: {
        ...image,
        perCard: {
          ...perCard,
          [String(cardCode)]: document,
        },
      },
    };
  });
}

function createId(prefix: string) {
  const randomId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}:${randomId}`;
}

function normalizeCardIds(cardIds: number[]) {
  return [...new Set(cardIds.filter((cardId) => Number.isInteger(cardId) && cardId > 0))];
}

function readCardGroups(metadata: WorkspaceMetadata | null) {
  return Array.isArray(metadata?.cardGroups)
    ? metadata.cardGroups.filter((group): group is WorkspaceCardGroup => {
        return Boolean(group)
          && typeof group === 'object'
          && typeof (group as WorkspaceCardGroup).id === 'string'
          && typeof (group as WorkspaceCardGroup).name === 'string'
          && Array.isArray((group as WorkspaceCardGroup).cardIds);
      })
    : [];
}

export function getCardGroups() {
  return readCardGroups(workspaceMetadataState.metadata);
}

export function getCardGroupById(groupId: string) {
  return getCardGroups().find((group) => group.id === groupId) ?? null;
}

export function upsertCardGroup(input: Partial<WorkspaceCardGroup> & {
  name: string;
  cardIds: number[];
  source: WorkspaceCardGroup['source'];
}) {
  const now = Date.now();
  const group: WorkspaceCardGroup = {
    id: input.id ?? createId('card-group'),
    name: input.name.trim() || 'Card Group',
    cardIds: normalizeCardIds(input.cardIds),
    source: input.source,
    createdAt: input.createdAt ?? now,
    updatedAt: now,
  };

  updateWorkspaceMetadata((metadata) => {
    const groups = readCardGroups(metadata);
    const exists = groups.some((item) => item.id === group.id);
    return {
      ...metadata,
      cardGroups: exists
        ? groups.map((item) => (item.id === group.id ? group : item))
        : [group, ...groups],
    };
  });

  return group;
}

export function deleteCardGroup(groupId: string) {
  updateWorkspaceMetadata((metadata) => ({
    ...metadata,
    cardGroups: readCardGroups(metadata).filter((group) => group.id !== groupId),
  }));
}

export function addCardsToGroup(groupId: string, cardIds: number[]) {
  const ids = normalizeCardIds(cardIds);
  if (ids.length === 0) return;

  updateWorkspaceMetadata((metadata) => ({
    ...metadata,
    cardGroups: readCardGroups(metadata).map((group) => group.id === groupId
      ? {
          ...group,
          cardIds: normalizeCardIds([...group.cardIds, ...ids]),
          source: 'manual',
          updatedAt: Date.now(),
        }
      : group),
  }));
}

export function removeCardsFromGroup(groupId: string, cardIds: number[]) {
  const removeSet = new Set(normalizeCardIds(cardIds));
  if (removeSet.size === 0) return;

  updateWorkspaceMetadata((metadata) => ({
    ...metadata,
    cardGroups: readCardGroups(metadata).map((group) => group.id === groupId
      ? {
          ...group,
          cardIds: group.cardIds.filter((cardId) => !removeSet.has(cardId)),
          source: 'manual',
          updatedAt: Date.now(),
        }
      : group),
  }));
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
  const thread: WorkspaceAiThread = {
    id: input.id ?? createId('ai-thread'),
    title: input.title,
    scope: input.scope ?? 'cdb',
    messages: input.messages ?? [],
    contextRefs: input.contextRefs ?? [],
    toolRuns: input.toolRuns ?? [],
    proposalIds: input.proposalIds ?? [],
    createdAt: input.createdAt ?? now,
    updatedAt: now,
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
    id: createId('ai-message'),
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
    id: createId('ai-message'),
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

export function updateAiProposalStatus(input: {
  threadId: string;
  proposalId: string;
  status: WorkspaceAiProposal['status'];
  applyLog?: WorkspaceAiProposal['applyLog'];
}) {
  updateWorkspaceMetadata((metadata) => {
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
  });
}

export function appendWorkspaceTaskHistory(input: {
  kind: string;
  label: string;
  summary?: Record<string, unknown>;
}) {
  const record: WorkspaceTaskHistoryRecord = {
    id: createId('task'),
    kind: input.kind,
    label: input.label,
    summary: input.summary ?? {},
    createdAt: Date.now(),
  };

  updateWorkspaceMetadata((metadata) => {
    const tasks = metadata.tasks && typeof metadata.tasks === 'object'
      ? metadata.tasks
      : {};
    const recent = Array.isArray(tasks.recent)
      ? tasks.recent as WorkspaceTaskHistoryRecord[]
      : [];

    return {
      ...metadata,
      tasks: {
        ...tasks,
        recent: [record, ...recent].slice(0, 50),
      },
    };
  });
}

export async function appendWorkspaceTaskHistoryForPath(
  cdbPath: string,
  input: { kind: string; label: string; summary?: Record<string, unknown> },
) {
  const path = cdbPath.trim();
  if (!path) return;
  if (workspaceMetadataState.ready && workspaceMetadataState.cdbPath === path) {
    appendWorkspaceTaskHistory(input);
    return;
  }

  const metadata = await loadWorkspaceMetadata(path);
  const tasks = metadata.tasks && typeof metadata.tasks === 'object'
    ? metadata.tasks
    : {};
  const recent = Array.isArray(tasks.recent)
    ? tasks.recent as WorkspaceTaskHistoryRecord[]
    : [];
  const record: WorkspaceTaskHistoryRecord = {
    id: createId('task'),
    kind: input.kind,
    label: input.label,
    summary: input.summary ?? {},
    createdAt: Date.now(),
  };

  await saveWorkspaceMetadata(path, {
    ...metadata,
    tasks: {
      ...tasks,
      recent: [record, ...recent].slice(0, 50),
    },
  });
}
