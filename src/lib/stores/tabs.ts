import { writable, get, derived } from 'svelte/store';
import { _ } from 'svelte-i18n';
import type { CardDataEntry, DbWorkspaceState, SearchFilters } from '#lib/types/index.ts';
import { DEFAULT_SEARCH_FILTERS } from '#lib/types/index.ts';
import { tauriBridge } from '#lib/infrastructure/tauri/index.ts';
import { pushRecentCdbEntry } from './recentHistory';
import { parseCachedFiltersJson, clearSourceFilterCacheForTab, refreshCachedSearchForTab } from './search';
import { documentRuntime } from '#lib/platform/appRuntime.ts';
import { CARD_COLLECTION_TYPE } from '#lib/modules/card/index.ts';
import { CDB_PROVIDER_ID } from '#lib/modules/cdb/index.ts';
import { getCdbPathIdentity } from '#lib/core/workspace/cdbPathIdentity.ts';
import { basename } from '#lib/core/path.ts';
import { initializeWorkspaceMetadataForNewCdb } from '#lib/features/workspace-metadata/state.svelte.ts';
import { writeErrorLog } from '#lib/utils/errorLog.ts';
import { showToast } from './toast.svelte';
import {
  popUndoLabel,
  pushUndoLabel,
  clearUndoHistory,
  getUndoLabels,
} from './undo';

export type CdbTab = DbWorkspaceState;

export const tabs = writable<CdbTab[]>([]);
export const activeTabId = writable<string | null>(null);

export const activeTab = derived(
  [tabs, activeTabId],
  ([$tabs, $activeTabId]) => $tabs.find(t => t.id === $activeTabId) || null
);

export const isDbLoaded = derived(activeTab, ($activeTab) => $activeTab !== null);

let syncingRuntime = false;
const inflightCdbOpens = new Map<string, Promise<string | null>>();
let pendingCdbCreationDialog: Promise<string | null> | null = null;

documentRuntime.subscribe((snapshot) => {
  syncingRuntime = true;
  const cdbDocuments = snapshot.documents.filter((document) => (
    document.typeId === CARD_COLLECTION_TYPE
    && document.providerId === CDB_PROVIDER_ID
  ));
  tabs.update((currentTabs) => {
    // Build a by-id index once so per-document lookup is O(1) (was O(n) via
    // find() inside map(), making the whole rebuild O(n²)).
    const currentById = new Map(currentTabs.map((tab) => [tab.id, tab]));
    return cdbDocuments.map((document) => {
      const current = currentById.get(document.id);
      const path = document.source?.path ?? document.source?.uri ?? '';
      const name = document.title;
      // Reuse the existing tab object reference when the document-derived
      // fields are unchanged. This prevents downstream stores ($activeTab,
      // isDbLoaded) and every $effect that depends on $activeTab/$activeTabId
      // from re-running on unrelated runtime emits (e.g. editing a card in
      // tab A no longer rebuilds tab B's object).
      if (current
        && current.path === path
        && current.name === name
        && current.isDirty === document.dirty) {
        return current;
      }
      const initialCards = Array.isArray(document.metadata.initialCards)
        ? document.metadata.initialCards as CardDataEntry[]
        : [];
      const initialTotal = Number(document.metadata.total ?? initialCards.length);
      return {
        id: document.id,
        path,
        name,
        cachedCards: current?.cachedCards ?? initialCards,
        cachedTotal: current?.cachedTotal ?? initialTotal,
        cachedPage: current?.cachedPage ?? 1,
        cachedFilters: current?.cachedFilters ?? '{}',
        cachedSelectedIds: current?.cachedSelectedIds
          ?? (initialCards[0] ? [initialCards[0].code] : []),
        cachedSelectedId: current?.cachedSelectedId ?? initialCards[0]?.code ?? null,
        cachedSelectionAnchorId: current?.cachedSelectionAnchorId ?? initialCards[0]?.code ?? null,
        isDirty: document.dirty,
      };
    });
  });
  const activeDocument = snapshot.documents.find((document) => (
    document.id === snapshot.activeDocumentId
    && document.typeId === CARD_COLLECTION_TYPE
  ));
  if (activeDocument) {
    activeTabId.set(activeDocument.id);
  } else if (cdbDocuments.length === 0) {
    activeTabId.set(null);
  }
  syncingRuntime = false;
});

activeTabId.subscribe((tabId) => {
  if (syncingRuntime || !tabId || !documentRuntime.getDocument(tabId)) {
    return;
  }
  if (documentRuntime.snapshot.activeDocumentId !== tabId) {
    documentRuntime.activate(tabId);
  }
});

async function openCdbAtPath(selected: string): Promise<string | null> {
  const selectedIdentity = getCdbPathIdentity(selected);
  const existing = get(tabs).find((tab) => getCdbPathIdentity(tab.path) === selectedIdentity);
  if (existing) {
    activeTabId.set(existing.id);
    pushRecentCdbEntry({ path: existing.path, name: existing.name });
    return existing.id;
  }

  const inflight = inflightCdbOpens.get(selectedIdentity);
  if (inflight) return inflight;

  const request = (async () => {
    try {
      const document = await documentRuntime.openSource({
        uri: selected,
        path: selected,
        name: basename(selected) || 'unknown.cdb',
      });
      pushRecentCdbEntry({ path: selected, name: document.title });
      return document.id;
    } catch (err) {
      console.error('Failed to read CDB:', err);
      return null;
    } finally {
      inflightCdbOpens.delete(selectedIdentity);
    }
  })();
  inflightCdbOpens.set(selectedIdentity, request);
  return request;
}

export async function openCdbPath(path: string): Promise<string | null> {
  const normalizedPath = path.trim();
  if (!normalizedPath) return null;
  return openCdbAtPath(normalizedPath);
}

export async function openCdbFile(): Promise<string | null> {
  const selected = await tauriBridge.open({
    multiple: false,
    filters: [{
      name: 'YGOPro CDB Database',
      extensions: ['cdb']
    }]
  });

  if (selected && typeof selected === 'string') {
    return openCdbAtPath(selected);
  }
  return null;
}

export async function openCdbHistoryEntry(path: string): Promise<string | null> {
  return openCdbPath(path);
}

function reportCdbCreationError(error: unknown, path?: string) {
  console.error('Failed to create CDB:', error);
  void writeErrorLog({ source: 'tabs.create', error, extra: { path } });
  showToast(get(_)('editor.create_cdb_failed'), 'error');
}

async function createCdbAtPath(selected: string): Promise<string | null> {
  const selectedIdentity = getCdbPathIdentity(selected);
  const existing = get(tabs).find((tab) => getCdbPathIdentity(tab.path) === selectedIdentity);
  if (existing || inflightCdbOpens.has(selectedIdentity)) {
    reportCdbCreationError(new Error('Cannot create a CDB over an open or opening path'), selected);
    return null;
  }

  const previousActiveId = documentRuntime.snapshot.activeDocumentId;
  const request = (async () => {
    try {
      const document = await documentRuntime.createDocument({
        typeId: CARD_COLLECTION_TYPE,
        providerId: CDB_PROVIDER_ID,
        title: basename(selected) || 'Untitled.cdb',
        initialData: [],
        destination: {
          uri: selected,
          path: selected,
          name: basename(selected) || 'Untitled.cdb',
        },
      }, { activate: false });
      try {
        await initializeWorkspaceMetadataForNewCdb(selected);
      } catch (error) {
        await documentRuntime.close(document.id, true);
        throw error;
      }
      if (documentRuntime.snapshot.activeDocumentId === previousActiveId) {
        documentRuntime.activate(document.id);
      }
      pushRecentCdbEntry({ path: selected, name: document.title });
      return document.id;
    } catch (err) {
      reportCdbCreationError(err, selected);
      return null;
    } finally {
      inflightCdbOpens.delete(selectedIdentity);
    }
  })();
  inflightCdbOpens.set(selectedIdentity, request);
  return request;
}

export function createCdbFile(path?: string): Promise<string | null> {
  if (path?.trim()) return createCdbAtPath(path.trim());
  if (pendingCdbCreationDialog) return pendingCdbCreationDialog;

  const request = (async () => {
    try {
      const selected = await tauriBridge.save({
        title: 'Create New CDB',
        filters: [{ name: 'YGOPro CDB Database', extensions: ['cdb'] }],
      });
      return typeof selected === 'string' && selected.trim()
        ? await createCdbAtPath(selected.trim())
        : null;
    } catch (error) {
      reportCdbCreationError(error);
      return null;
    }
  })();
  pendingCdbCreationDialog = request;
  const clearPendingDialog = () => { pendingCdbCreationDialog = null; };
  void request.then(clearPendingDialog, clearPendingDialog);
  return request;
}

export async function closeTab(tabId: string) {
  if (!get(tabs).some((tab) => tab.id === tabId)) return false;

  try {
    await documentRuntime.close(tabId, true);
  } catch (err) {
    console.error('Failed to close CDB tab:', err);
    return false;
  }

  clearUndoHistory(tabId);
  clearSourceFilterCacheForTab(tabId);
  return true;
}

export async function saveCdbTab(tabId: string): Promise<boolean> {
  const tab = get(tabs).find((item) => item.id === tabId);
  if (!tab) return false;

  try {
    await documentRuntime.save(tab.id);
    return true;
  } catch (err) {
    console.error('Failed to save CDB:', err);
    return false;
  }
}

export function getCachedFilters(): SearchFilters {
  const tab = get(activeTab);
  if (!tab) return { ...DEFAULT_SEARCH_FILTERS };
  return parseCachedFiltersJson(tab.cachedFilters);
}

export function cacheActiveTabSelection(selectedIds: number[], selectedId: number | null, selectionAnchorId: number | null) {
  const tabId = get(activeTabId);
  if (!tabId) return;

  tabs.update((currentTabs) =>
    currentTabs.map((tab) =>
      tab.id === tabId
        ? {
            ...tab,
            cachedSelectedIds: [...selectedIds],
            cachedSelectedId: selectedId,
            cachedSelectionAnchorId: selectionAnchorId,
          }
        : tab
    )
  );
}

export function hasUnsavedChanges(tabId: string | null = get(activeTabId)): boolean {
  if (!tabId) return false;
  const tab = get(tabs).find((item) => item.id === tabId);
  return tab?.isDirty ?? false;
}

export function hasUndoableAction(): boolean {
  const tabId = get(activeTabId);
  if (!tabId) return false;
  return getUndoLabels(tabId).length > 0;
}

export function getLastUndoLabel(): string | null {
  const tabId = get(activeTabId);
  if (!tabId) return null;
  const stack = getUndoLabels(tabId);
  return stack[stack.length - 1] ?? null;
}

export async function undoLastOperation(refreshCachedSearch = true): Promise<boolean> {
  const tab = get(activeTab);
  if (!tab) return false;

  return undoLastOperationInTab(tab.id, refreshCachedSearch);
}

export async function undoLastOperationInTab(tabId: string, refreshCachedSearch = true): Promise<boolean> {
  const tab = get(tabs).find((item) => item.id === tabId);
  if (!tab) return false;

  try {
    const result = await documentRuntime.undo(tab.id);
    if (!result.changed) return false;

    const change = (result.value as import('#lib/modules/card/index.ts').CardIdChangeResult | undefined)?.cardIdChange;
    if (change) {
      const { syncScriptTabsAfterCardIdChange } = await import('./scriptEditor.svelte');
      syncScriptTabsAfterCardIdChange(tab.id, change);
    }

    popUndoLabel(tab.id);
    clearSourceFilterCacheForTab(tab.id);
    if (refreshCachedSearch) {
      await refreshCachedSearchForTab(tab.id);
    }
    return true;
  } catch (err) {
    console.error('Failed to undo operation:', err);
    return false;
  }
}

export async function saveCdbTabAs(tabId: string, path: string): Promise<boolean> {
  const tab = get(tabs).find((item) => item.id === tabId);
  const targetPath = path.trim();
  if (!tab || !targetPath) return false;

  const comparableTarget = getCdbPathIdentity(targetPath);
  const conflict = get(tabs).find((item) => (
    item.id !== tabId
    && getCdbPathIdentity(item.path) === comparableTarget
  ));
  if (conflict) {
    console.error(`Cannot save CDB as an already open path: ${targetPath}`);
    return false;
  }

  try {
    const name = basename(targetPath) || tab.name;
    const sourcePath = tab.path;
    const saved = await documentRuntime.save(tab.id, {
      uri: targetPath,
      path: targetPath,
      name,
    });
    // Copy editor metadata only after the CDB itself was written, so a failed
    // Save As does not leave orphaned .dey files at the destination.
    if (sourcePath) {
      try {
        const { copyWorkspaceMetadataForSaveAs } = await import('#lib/features/workspace-metadata/state.svelte.ts');
        await copyWorkspaceMetadataForSaveAs(sourcePath, targetPath);
      } catch (metadataError) {
        console.error('Failed to copy workspace metadata for Save As:', metadataError);
        void writeErrorLog({
          source: 'tabs.save-as.metadata',
          error: metadataError,
          extra: { sourcePath, targetPath },
        });
      }
    }
    pushRecentCdbEntry({ path: targetPath, name: saved.title });
    return true;
  } catch (err) {
    console.error('Failed to save CDB as:', err);
    return false;
  }
}

export function recordUndoLabel(tabId: string, label: string) {
  pushUndoLabel(tabId, label);
}
