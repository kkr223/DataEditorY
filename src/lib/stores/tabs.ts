import { writable, get, derived } from 'svelte/store';
import type { CardDataEntry, DbWorkspaceState, SearchFilters } from '$lib/types';
import { DEFAULT_SEARCH_FILTERS } from '$lib/types';
import { invokeCommand, tauriBridge } from '$lib/infrastructure/tauri';
import { cloneCard } from './cardUtils';
import { pushRecentCdbEntry } from './recentHistory';
import { getUndoStack, clearUndoHistory } from './undo';
import { parseCachedFiltersJson, clearSourceFilterCacheForTab, refreshCachedSearchForTab } from './search';

export type CdbTab = DbWorkspaceState;

export const tabs = writable<CdbTab[]>([]);
export const activeTabId = writable<string | null>(null);

export const activeTab = derived(
  [tabs, activeTabId],
  ([$tabs, $activeTabId]) => $tabs.find(t => t.id === $activeTabId) || null
);

export const isDbLoaded = derived(activeTab, ($activeTab) => $activeTab !== null);

interface OpenCdbTabResponse {
  name: string;
  cachedCards: CardDataEntry[];
  cachedTotal: number;
}

async function openCdbAtPath(selected: string): Promise<string | null> {
  const existing = get(tabs).find(t => t.path === selected);
  if (existing) {
    activeTabId.set(existing.id);
    pushRecentCdbEntry({ path: existing.path, name: existing.name });
    return existing.id;
  }

  try {
    const id = crypto.randomUUID();
    const response = await invokeCommand<OpenCdbTabResponse>('open_cdb_tab', { tabId: id, path: selected });

    const tab: CdbTab = {
      id,
      path: selected,
      name: response.name,
      cachedCards: response.cachedCards,
      cachedTotal: response.cachedTotal,
      cachedPage: 1,
      cachedFilters: '{}',
      cachedSelectedIds: response.cachedCards.length > 0 ? [response.cachedCards[0].code] : [],
      cachedSelectedId: response.cachedCards[0]?.code ?? null,
      cachedSelectionAnchorId: response.cachedCards[0]?.code ?? null,
      isDirty: false
    };
    tabs.update(t => [...t, tab]);
    activeTabId.set(id);
    pushRecentCdbEntry({ path: selected, name: response.name });
    return id;
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

export async function createCdbFile(): Promise<string | null> {
  const selected = await tauriBridge.save({
    title: 'Create New CDB',
    filters: [{
      name: 'YGOPro CDB Database',
      extensions: ['cdb']
    }]
  });

  if (selected && typeof selected === 'string') {
    try {
      const id = crypto.randomUUID();
      const response = await invokeCommand<OpenCdbTabResponse>('create_cdb_tab', { tabId: id, path: selected });

      const tab: CdbTab = {
        id,
        path: selected,
        name: response.name,
        cachedCards: [],
        cachedTotal: 0,
        cachedPage: 1,
        cachedFilters: '{}',
        cachedSelectedIds: [],
        cachedSelectedId: null,
        cachedSelectionAnchorId: null,
        isDirty: false
      };
      tabs.update(t => [...t, tab]);
      activeTabId.set(id);
      pushRecentCdbEntry({ path: selected, name: response.name });
      return id;
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
    await invokeCommand('close_cdb_tab', { tabId });
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
    await invokeCommand('save_cdb_tab', { tabId: tab.id });
    markTabDirty(tab.id, false);
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
  return getUndoStack(tabId).length > 0;
}

export function getLastUndoLabel(): string | null {
  const tabId = get(activeTabId);
  if (!tabId) return null;
  const stack = getUndoStack(tabId);
  return stack[stack.length - 1]?.label ?? null;
}

export async function undoLastOperation(): Promise<boolean> {
  const tab = get(activeTab);
  if (!tab) return false;

  const stack = getUndoStack(tab.id);
  const operation = stack.pop();
  if (!operation) return false;

  try {
    if (operation.kind === 'modify') {
      const cardsToRestore = operation.previousCards.filter((card): card is CardDataEntry => card !== null);
      const deletedIds = operation.affectedIds.filter((cardId, index) => operation.previousCards[index] === null);

      await invokeCommand('undo_modify_operation', {
        request: {
          tabId: tab.id,
          cardsToRestore: cardsToRestore.map((card) => cloneCard(card)),
          idsToDelete: deletedIds,
        },
      });
    } else if (operation.deletedCards.length > 0) {
      await invokeCommand('modify_cards', {
        request: {
          tabId: tab.id,
          cards: operation.deletedCards.map((card) => cloneCard(card)),
        },
      });
    }

    clearSourceFilterCacheForTab(tab.id);
    await refreshCachedSearchForTab(tab.id);
    markActiveTabDirty(true);
    return true;
  } catch (err) {
    console.error('Failed to undo operation:', err);
    stack.push(operation);
    return false;
  }
}
