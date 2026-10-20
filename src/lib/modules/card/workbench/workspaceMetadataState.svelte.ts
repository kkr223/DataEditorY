import type { CardImageConfigDocument } from '$lib/features/card-image/layout';
import { DEFAULT_SEARCH_FILTERS, type SearchFilters } from '$lib/types';
import { loadWorkspaceMetadata, type WorkspaceMetadata } from '$lib/native/metadataApi';
import { isCurrentMetadataPath, workspaceMetadataState, updateWorkspaceMetadata, updateWorkspaceMetadataForPath } from '$lib/features/workspace-metadata/state.svelte';

// Compatibility exports keep existing workbench consumers on the same state instance.
export { workspaceMetadataState, updateWorkspaceMetadata, captureWorkspaceMetadataScope,
  loadWorkspaceMetadataForPath, copyWorkspaceMetadataForSaveAs, flushAllWorkspaceMetadataSaves,
} from '$lib/features/workspace-metadata/state.svelte';
export type * from '$lib/features/ai/types';
export { getAiThreads, getActiveAiThread, getAiProposals, getAiProposalsForThread,
  upsertAiThread, deleteAiThread, accumulateAiThreadTokenUsage, resetAiThreadTokenUsage,
  appendAiMessage, compactAiThreadMessages, upsertAiToolRun, addAiProposal, updateAiProposalStatus,
} from '$lib/features/ai/workspaceState';

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

export function getCardShowcaseOutputDir() {
  const ui = workspaceMetadataState.metadata?.ui;
  const showcase = ui && typeof ui === 'object' ? ui.cardShowcase : null;
  const outputDir = showcase && typeof showcase === 'object'
    ? (showcase as { outputDir?: unknown }).outputDir
    : null;
  return typeof outputDir === 'string' ? outputDir : '';
}

export function setCardShowcaseOutputDir(outputDir: string) {
  updateWorkspaceMetadata((metadata) => ({
    ...metadata,
    ui: {
      ...(metadata.ui ?? {}),
      cardShowcase: { outputDir: outputDir.trim() },
    },
  }));
}

function normalizeExplorerFilters(value: unknown): Partial<SearchFilters> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const filters: Partial<SearchFilters> = {};
  for (const key of Object.keys(DEFAULT_SEARCH_FILTERS) as Array<keyof SearchFilters>) {
    if (typeof source[key] === 'string') filters[key] = source[key] as string;
  }
  return filters;
}

function normalizeOptionalCardId(value: unknown): number | null {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : null;
}

export function getCardExplorerState(): WorkspaceCardExplorerState | null {
  const ui = workspaceMetadataState.metadata?.ui;
  const explorer = ui && typeof ui === 'object'
    ? ui.cardExplorer
    : null;
  if (!explorer || typeof explorer !== 'object' || Array.isArray(explorer)) return null;

  const record = explorer as Record<string, unknown>;
  return {
    filters: normalizeExplorerFilters(record.filters),
    selectedIds: normalizeCardIds(
      Array.isArray(record.selectedIds)
        ? record.selectedIds.filter((id): id is number => Number.isInteger(id) && id > 0)
        : [],
    ),
    selectedId: normalizeOptionalCardId(record.selectedId),
    selectionAnchorId: normalizeOptionalCardId(record.selectionAnchorId),
    page: Number.isInteger(record.page) && Number(record.page) > 0 ? Number(record.page) : 1,
  };
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

function readCardImageDocument(metadata: WorkspaceMetadata | null, cardCode: number) {
  const image = metadata?.image;
  const perCard = image && typeof image === 'object'
    ? (image.perCard as Record<string, unknown> | undefined)
    : undefined;
  const document = perCard?.[String(cardCode)];
  return document && typeof document === 'object'
    ? document as CardImageConfigDocument
    : null;
}

export function getCardImageDocument(cardCode: number) {
  return readCardImageDocument(workspaceMetadataState.metadata, cardCode);
}

export async function getCardImageDocumentForPath(cdbPath: string, cardCode: number) {
  const path = cdbPath.trim();
  if (!path) return null;
  if (isCurrentMetadataPath(path)) {
    return getCardImageDocument(cardCode);
  }
  return readCardImageDocument(await loadWorkspaceMetadata(path), cardCode);
}

function setCardImageDocumentInMetadata(
  metadata: WorkspaceMetadata,
  cardCode: number,
  document: CardImageConfigDocument,
) {
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
}

export function setCardImageDocument(cardCode: number, document: CardImageConfigDocument) {
  updateWorkspaceMetadata((metadata) => setCardImageDocumentInMetadata(metadata, cardCode, document));
}

export async function setCardImageDocumentForPath(
  cdbPath: string,
  cardCode: number,
  document: CardImageConfigDocument,
) {
  const path = cdbPath.trim();
  if (!path) return;
  await updateWorkspaceMetadataForPath(path, (metadata) => (
    setCardImageDocumentInMetadata(metadata, cardCode, document)
  ));
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
  const record: WorkspaceTaskHistoryRecord = {
    id: createId('task'),
    kind: input.kind,
    label: input.label,
    summary: input.summary ?? {},
    createdAt: Date.now(),
  };

  await updateWorkspaceMetadataForPath(path, (metadata) => {
    const tasks = metadata.tasks ?? {};
    const recent = Array.isArray(tasks.recent) ? tasks.recent as WorkspaceTaskHistoryRecord[] : [];
    return {
      ...metadata,
      tasks: { ...tasks, recent: [record, ...recent].slice(0, 50) },
    };
  });
}
