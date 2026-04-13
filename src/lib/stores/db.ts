import { writable, get, derived } from 'svelte/store';
import type { CardDataEntry, DbWorkspaceState, SearchFilters } from '$lib/types';
import { DEFAULT_SEARCH_FILTERS } from '$lib/types';
import { buildSearchQuery } from '$lib/domain/search/query';
import {
  getRuleExpressionErrorMessage,
  RuleExpressionError,
} from '$lib/domain/search/ruleExpression';
import { invokeCommand, tauriBridge } from '$lib/infrastructure/tauri';

export type CdbTab = DbWorkspaceState;

export const tabs = writable<CdbTab[]>([]);
export const activeTabId = writable<string | null>(null);

export interface RecentCdbEntry {
  path: string;
  name: string;
}

export interface CachedSearchSnapshot {
  tabId: string;
  cards: CardDataEntry[];
  total: number;
  page: number;
  filters: SearchFilters;
}

type UndoOperation =
  | {
      kind: 'modify';
      label: string;
      affectedIds: number[];
      previousCards: Array<CardDataEntry | null>;
    }
  | {
      kind: 'delete';
      label: string;
      affectedIds: number[];
      deletedCards: CardDataEntry[];
    };

const undoHistory = new Map<string, UndoOperation[]>();
const RECENT_CDB_HISTORY_KEY = 'recent-cdb-history';
const MAX_RECENT_CDB_HISTORY = 6;

export const recentCdbHistory = writable<RecentCdbEntry[]>([]);

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

interface SearchCardsPageResponse {
  cards: CardDataEntry[];
  total: number;
}

const SEARCH_PAGE_SIZE = 50;
const cachedSearchRefreshListeners = new Set<(snapshot: CachedSearchSnapshot) => void>();

function canUseLocalStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function normalizeRecentCdbHistory(value: unknown): RecentCdbEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seenPaths = new Set<string>();
  const entries: RecentCdbEntry[] = [];

  for (const item of value) {
    if (!item || typeof item !== 'object') continue;

    const path = typeof item.path === 'string' ? item.path.trim() : '';
    if (!path || seenPaths.has(path)) continue;

    const name = typeof item.name === 'string' && item.name.trim()
      ? item.name.trim()
      : path.split(/[/\\]/).pop() || path;

    seenPaths.add(path);
    entries.push({ path, name });

    if (entries.length >= MAX_RECENT_CDB_HISTORY) {
      break;
    }
  }

  return entries;
}

function persistRecentCdbHistory(entries: RecentCdbEntry[]) {
  if (!canUseLocalStorage()) return;
  window.localStorage.setItem(RECENT_CDB_HISTORY_KEY, JSON.stringify(entries));
}

function pushRecentCdbEntry(entry: RecentCdbEntry) {
  recentCdbHistory.update((current) => {
    const next = [
      entry,
      ...current.filter((item) => item.path !== entry.path),
    ].slice(0, MAX_RECENT_CDB_HISTORY);
    persistRecentCdbHistory(next);
    return next;
  });
}

export function loadRecentCdbHistory() {
  if (!canUseLocalStorage()) return;

  try {
    const raw = window.localStorage.getItem(RECENT_CDB_HISTORY_KEY);
    recentCdbHistory.set(normalizeRecentCdbHistory(raw ? JSON.parse(raw) : []));
  } catch {
    recentCdbHistory.set([]);
  }
}

export function removeRecentCdbHistoryEntry(path: string) {
  const normalizedPath = path.trim();
  if (!normalizedPath) return;

  recentCdbHistory.update((current) => {
    const next = current.filter((item) => item.path !== normalizedPath);
    persistRecentCdbHistory(next);
    return next;
  });
}

function cloneCard(card: CardDataEntry): CardDataEntry {
  return {
    ...card,
    setcode: Array.isArray(card.setcode) ? [...card.setcode] : [],
    strings: Array.isArray(card.strings) ? [...card.strings] : [],
    ruleCode: Number(card.ruleCode ?? 0),
  };
}

function cloneCards(cards: CardDataEntry[]): CardDataEntry[] {
  return cards.map((card) => cloneCard(card));
}

function parseCachedFiltersJson(serialized: string): SearchFilters {
  try {
    return { ...DEFAULT_SEARCH_FILTERS, ...JSON.parse(serialized) as Partial<SearchFilters> };
  } catch {
    return { ...DEFAULT_SEARCH_FILTERS };
  }
}

function updateCachedSearchSnapshot(snapshot: CachedSearchSnapshot) {
  const clonedCards = cloneCards(snapshot.cards);
  tabs.update((currentTabs) =>
    currentTabs.map((item) =>
      item.id === snapshot.tabId
        ? {
            ...item,
            cachedCards: clonedCards,
            cachedTotal: snapshot.total,
            cachedPage: snapshot.page,
            cachedFilters: JSON.stringify(snapshot.filters),
          }
        : item
    )
  );

  const listenerSnapshot: CachedSearchSnapshot = {
    ...snapshot,
    cards: clonedCards,
  };
  for (const listener of cachedSearchRefreshListeners) {
    listener(listenerSnapshot);
  }
}

async function searchCardsPageInTab(
  tabId: string,
  filters: SearchFilters,
  page = 1,
  pageSize = SEARCH_PAGE_SIZE,
): Promise<{ cards: CardDataEntry[]; total: number }> {
  const { whereClause, params } = buildSearchQuery(filters);
  const safePage = Math.max(1, page);
  const response = await invokeCommand<SearchCardsPageResponse>('search_cards_page', {
    request: {
      tabId,
      whereClause,
      params,
      page: safePage,
      pageSize,
    },
  });

  return {
    cards: cloneCards(response.cards),
    total: response.total,
  };
}

async function refreshCachedSearchForTab(tabId: string): Promise<boolean> {
  const tab = get(tabs).find((item) => item.id === tabId);
  if (!tab) return false;

  const filters = parseCachedFiltersJson(tab.cachedFilters);
  let page = Math.max(1, tab.cachedPage || 1);

  try {
    let { cards, total } = await searchCardsPageInTab(tab.id, filters, page);
    if (cards.length === 0 && total > 0 && page > 1) {
      const lastPage = Math.max(1, Math.ceil(total / SEARCH_PAGE_SIZE));
      if (lastPage !== page) {
        page = lastPage;
        ({ cards, total } = await searchCardsPageInTab(tab.id, filters, page));
      }
    }

    updateCachedSearchSnapshot({
      tabId: tab.id,
      cards,
      total,
      page,
      filters,
    });
    return true;
  } catch (err) {
    if (err instanceof RuleExpressionError) {
      throw err;
    }
    console.error('Failed to refresh cached search results:', err);
    return false;
  }
}

export function onCachedSearchRefreshed(listener: (snapshot: CachedSearchSnapshot) => void) {
  cachedSearchRefreshListeners.add(listener);
  return () => {
    cachedSearchRefreshListeners.delete(listener);
  };
}

function getUndoStack(tabId: string): UndoOperation[] {
  let stack = undoHistory.get(tabId);
  if (!stack) {
    stack = [];
    undoHistory.set(tabId, stack);
  }
  return stack;
}

function pushUndoOperation(tabId: string, operation: UndoOperation) {
  const stack = getUndoStack(tabId);
  stack.push(operation);
  if (stack.length > 100) {
    stack.shift();
  }
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

/** Open a .cdb file and add it as a new tab. Returns the tab id or null. */
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

/** Create a new .cdb file, save it and open as a new tab. */
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
      console.error("Failed to create CDB:", err);
      return null;
    }
  }
  return null;
}

/** Close a tab by its id */
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
  undoHistory.delete(tabId);

  if (get(activeTabId) === tabId) {
    if (newTabs.length > 0) {
      const newIdx = Math.min(idx, newTabs.length - 1);
      activeTabId.set(newTabs[newIdx].id);
    } else {
      activeTabId.set(null);
    }
  }
}

/** Save the active tab's CDB back to disk */
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

/** Get cached cards for the active tab (for instant tab switching) */
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

function markTabDirty(tabId: string, isDirty = true) {
  tabs.update((currentTabs) =>
    currentTabs.map((tab) => (tab.id === tabId ? { ...tab, isDirty } : tab))
  );
}

export function markActiveTabDirty(isDirty = true) {
  const tabId = get(activeTabId);
  if (!tabId) return;

  markTabDirty(tabId, isDirty);
}

function syncCachedCardsInTab(tabId: string, cards: CardDataEntry[]) {
  if (cards.length === 0) return;

  const nextByCode = new Map(cards.map((card) => [card.code, cloneCard(card)]));
  tabs.update((currentTabs) =>
    currentTabs.map((tab) =>
      tab.id === tabId
        ? {
            ...tab,
            cachedCards: tab.cachedCards.map((cachedCard) => nextByCode.get(cachedCard.code) ?? cachedCard),
          }
        : tab
    )
  );
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

    await refreshCachedSearchForTab(tab.id);
    markActiveTabDirty(true);
    return true;
  } catch (err) {
    console.error('Failed to undo operation:', err);
    stack.push(operation);
    return false;
  }
}

export async function getCardById(cardId: number): Promise<CardDataEntry | undefined> {
  const tab = get(activeTab);
  if (!tab) return undefined;
  return getCardByIdInTab(tab.id, cardId);
}

export async function getCardByIdInTab(tabId: string, cardId: number): Promise<CardDataEntry | undefined> {
  try {
    return await invokeCommand<CardDataEntry | null>('get_card_by_id', { tabId, cardId }) ?? undefined;
  } catch (err) {
    console.error('Failed to fetch card by id:', err);
    return undefined;
  }
}

export async function getCardsByIdsInTab(tabId: string, cardIds: number[]): Promise<CardDataEntry[]> {
  const safeIds = [...new Set(cardIds.filter((cardId) => Number.isInteger(cardId) && cardId > 0))];
  if (safeIds.length === 0) {
    return [];
  }

  try {
    return await invokeCommand<CardDataEntry[]>('get_cards_by_ids', {
      request: {
        tabId,
        cardIds: safeIds,
      },
    });
  } catch (err) {
    console.error('Failed to fetch cards by ids:', err);
    return [];
  }
}

export async function getCardsByIds(cardIds: number[]): Promise<CardDataEntry[]> {
  const tab = get(activeTab);
  if (!tab) return [];
  return getCardsByIdsInTab(tab.id, cardIds);
}

/** Modify (upsert) a card in the active tab's working CDB */
export async function modifyCard(card: CardDataEntry): Promise<boolean> {
  return modifyCards([card]);
}

export async function modifyCardsInTab(tabId: string, cards: CardDataEntry[]): Promise<boolean> {
  const tab = get(tabs).find((item) => item.id === tabId);
  if (!tab) return false;

  try {
    const previousCardsByCode = new Map(
      (await getCardsByIdsInTab(tab.id, cards.map((card) => card.code)))
        .map((card) => [card.code, card] as const),
    );
    await invokeCommand('modify_cards', {
      request: {
        tabId: tab.id,
        cards: cards.map((card) => cloneCard(card)),
      },
    });
    pushUndoOperation(tab.id, {
      kind: 'modify',
      label: cards.length === 1 ? `Edit card ${cards[0].code}` : `Modify ${cards.length} cards`,
      affectedIds: cards.map((card) => card.code),
      previousCards: cards.map((card) => previousCardsByCode.get(card.code) ?? null),
    });
    const refreshed = await refreshCachedSearchForTab(tab.id);
    if (!refreshed) {
      syncCachedCardsInTab(tab.id, cards);
    }
    markTabDirty(tab.id, true);
    return true;
  } catch (err) {
    console.error('Failed to modify cards:', err);
    return false;
  }
}

export async function modifyCardsWithSnapshotInTab(
  tabId: string,
  cards: CardDataEntry[],
  previousCards: Array<CardDataEntry | null | undefined>,
): Promise<boolean> {
  const tab = get(tabs).find((item) => item.id === tabId);
  if (!tab) return false;

  try {
    await invokeCommand('modify_cards', {
      request: {
        tabId: tab.id,
        cards: cards.map((card) => cloneCard(card)),
      },
    });
    pushUndoOperation(tab.id, {
      kind: 'modify',
      label: cards.length === 1 ? `Edit card ${cards[0].code}` : `Modify ${cards.length} cards`,
      affectedIds: cards.map((card) => card.code),
      previousCards: cards.map((card, index) => {
        const previous = previousCards[index];
        return previous && previous.code === card.code ? cloneCard(previous) : null;
      }),
    });
    const refreshed = await refreshCachedSearchForTab(tab.id);
    if (!refreshed) {
      syncCachedCardsInTab(tab.id, cards);
    }
    markTabDirty(tab.id, true);
    return true;
  } catch (err) {
    console.error('Failed to modify cards with snapshots:', err);
    return false;
  }
}

export async function modifyCards(cards: CardDataEntry[]): Promise<boolean> {
  const tab = get(activeTab);
  if (!tab) return false;
  return modifyCardsInTab(tab.id, cards);
}

/** Delete a card from the active tab's working CDB by id */
export async function deleteCard(cardId: number): Promise<boolean> {
  return deleteCards([cardId]);
}

export async function deleteCards(cardIds: number[]): Promise<boolean> {
  const tab = get(activeTab);
  if (!tab) return false;

  try {
    const deletedCards = (await getCardsByIdsInTab(tab.id, cardIds)).map((card) => cloneCard(card));

    await invokeCommand('delete_cards', {
      request: {
        tabId: tab.id,
        cardIds,
      },
    });

    if (deletedCards.length > 0) {
      pushUndoOperation(tab.id, {
        kind: 'delete',
        label: deletedCards.length === 1 ? `Delete card ${deletedCards[0].code}` : `Delete ${deletedCards.length} cards`,
        affectedIds: deletedCards.map((card) => card.code),
        deletedCards,
      });
    }
    await refreshCachedSearchForTab(tab.id);
    markActiveTabDirty(true);
    return true;
  } catch (err) {
    console.error("Failed to delete cards:", err);
    return false;
  }
}

export async function deleteCardsWithSnapshotInTab(
  tabId: string,
  cardIds: number[],
  deletedCards: CardDataEntry[],
): Promise<boolean> {
  const tab = get(tabs).find((item) => item.id === tabId);
  if (!tab) return false;

  try {
    await invokeCommand('delete_cards', {
      request: {
        tabId: tab.id,
        cardIds,
      },
    });

    if (deletedCards.length > 0) {
      pushUndoOperation(tab.id, {
        kind: 'delete',
        label: deletedCards.length === 1 ? `Delete card ${deletedCards[0].code}` : `Delete ${deletedCards.length} cards`,
        affectedIds: deletedCards.map((card) => card.code),
        deletedCards: deletedCards.map((card) => cloneCard(card)),
      });
    }
    await refreshCachedSearchForTab(tab.id);
    markTabDirty(tab.id, true);
    return true;
  } catch (err) {
    console.error('Failed to delete cards with snapshots:', err);
    return false;
  }
}

export async function queryCardsRaw(tabId: string, queryClause: string, params: Record<string, string | number> = {}): Promise<CardDataEntry[]> {
  try {
    return await invokeCommand<CardDataEntry[]>('query_cards_raw', {
      request: {
        tabId,
        queryClause,
        params,
      },
    });
  } catch (err) {
    console.error('Failed to query cards:', err);
    return [];
  }
}

/** Search one page of cards in the active tab's CDB */
export async function searchCardsPage(filters: SearchFilters = DEFAULT_SEARCH_FILTERS, page = 1, pageSize = 50): Promise<{ cards: CardDataEntry[]; total: number }> {
  const tab = get(activeTab);
  if (!tab) return { cards: [], total: 0 };

  try {
    const safePage = Math.max(1, page);
    const response = await searchCardsPageInTab(tab.id, filters, safePage, pageSize);
    updateCachedSearchSnapshot({
      tabId: tab.id,
      cards: response.cards,
      total: response.total,
      page: safePage,
      filters,
    });
    return response;
  } catch (err) {
    if (err instanceof RuleExpressionError) {
      throw err;
    }
    console.error("Search failed:", err);
    return { cards: [], total: 0 };
  }
}
