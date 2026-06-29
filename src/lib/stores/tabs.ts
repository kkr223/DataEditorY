import { writable, get, derived } from 'svelte/store';
import type { CardDataEntry, DbWorkspaceState, SearchFilters } from '$lib/types';
import { DEFAULT_SEARCH_FILTERS } from '$lib/types';
import { tauriBridge } from '$lib/infrastructure/tauri';
import { pushRecentCdbEntry } from './recentHistory';
import { parseCachedFiltersJson, clearSourceFilterCacheForTab, refreshCachedSearchForTab } from './search';
import { documentRuntime } from '$lib/platform/appRuntime';
import { CARD_COLLECTION_TYPE } from '$lib/modules/card';
import { CDB_PROVIDER_ID } from '$lib/modules/cdb';
import { getCdbPathIdentity } from '$lib/core/workspace/cdbPathIdentity';
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

  try {
    const document = await documentRuntime.openSource({
      uri: selected,
      path: selected,
      name: selected.split(/[\\/]/).pop() || 'unknown.cdb',
    });
    pushRecentCdbEntry({ path: selected, name: document.title });
    return document.id;
  } catch (err) {
    console.error('Failed to read CDB:', err);
    return null;
  }
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

export async function createCdbFile(path?: string): Promise<string | null> {
  const selected = path?.trim() || await tauriBridge.save({
    title: 'Create New CDB',
    filters: [{
      name: 'YGOPro CDB Database',
      extensions: ['cdb']
    }]
  });

  if (selected && typeof selected === 'string') {
    try {
      const document = await documentRuntime.createDocument({
        typeId: CARD_COLLECTION_TYPE,
        providerId: CDB_PROVIDER_ID,
        title: selected.split(/[\\/]/).pop() || 'Untitled.cdb',
        initialData: [],
      });
      const saved = await documentRuntime.save(document.id, {
        uri: selected,
        path: selected,
        name: selected.split(/[\\/]/).pop() || 'Untitled.cdb',
      });
      pushRecentCdbEntry({ path: selected, name: saved.title });
      return saved.id;
    } catch (err) {
      console.error('Failed to create CDB:', err);
      return null;
    }
  }
  return null;
}

export async function closeTab(tabId: string) {
  const currentTabs = get(tabs);
  const idx = currentTabs.findIndex(t => t.id === tabId);
  if (idx === -1) return;

  try {
    await documentRuntime.close(tabId, true);
  } catch (err) {
    console.error('Failed to close CDB tab:', err);
  }

  const newTabs = currentTabs.filter(t => t.id !== tabId);
  tabs.set(newTabs);
  clearUndoHistory(tabId);
  clearSourceFilterCacheForTab(tabId);

  if (get(activeTabId) === tabId) {
    if (newTabs.length > 0) {
      const newIdx = Math.min(idx, newTabs.length - 1);
      activeTabId.set(newTabs[newIdx].id);
    } else {
      activeTabId.set(null);
    }
  }
}

export async function saveCdbFile(): Promise<boolean> {
  const tab = get(activeTab);
  if (!tab) return false;

  return saveCdbTab(tab.id);
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

export function getCachedCards(): CardDataEntry[] {
  const tab = get(activeTab);
  return tab ? tab.cachedCards : [];
}

export function getCachedTotal(): number {
  const tab = get(activeTab);
  return tab ? tab.cachedTotal : 0;
}

export function getCachedPage(): number {
  const tab = get(activeTab);
  return tab ? tab.cachedPage : 1;
}

export function getCachedFilters(): SearchFilters {
  const tab = get(activeTab);
  if (!tab) return { ...DEFAULT_SEARCH_FILTERS };
  return parseCachedFiltersJson(tab.cachedFilters);
}

export function getCachedSelectedIds(): number[] {
  const tab = get(activeTab);
  return tab ? [...tab.cachedSelectedIds] : [];
}

export function getCachedSelectedId(): number | null {
  const tab = get(activeTab);
  return tab ? tab.cachedSelectedId : null;
}

export function getCachedSelectionAnchorId(): number | null {
  const tab = get(activeTab);
  return tab ? tab.cachedSelectionAnchorId : null;
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

export function markTabDirty(tabId: string, isDirty = true) {
  tabs.update((currentTabs) =>
    currentTabs.map((tab) => (tab.id === tabId ? { ...tab, isDirty } : tab))
  );
}

export function markActiveTabDirty(isDirty = true) {
  const tabId = get(activeTabId);
  if (!tabId) return;

  markTabDirty(tabId, isDirty);
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

export async function undoLastOperation(): Promise<boolean> {
  const tab = get(activeTab);
  if (!tab) return false;

  return undoLastOperationInTab(tab.id);
}

export async function undoLastOperationInTab(tabId: string): Promise<boolean> {
  const tab = get(tabs).find((item) => item.id === tabId);
  if (!tab) return false;

  try {
    const result = await documentRuntime.undo(tab.id);
    if (!result.changed) return false;

    popUndoLabel(tab.id);
    clearSourceFilterCacheForTab(tab.id);
    await refreshCachedSearchForTab(tab.id);
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
    const name = targetPath.split(/[\\/]/).pop() || tab.name;
    const saved = await documentRuntime.save(tab.id, {
      uri: targetPath,
      path: targetPath,
      name,
    });
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
