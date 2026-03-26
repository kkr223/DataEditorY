import { writable, get, derived } from 'svelte/store';
import type { CardDataEntry, DbWorkspaceState, SearchFilters } from '$lib/types';
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
  if (!tab) return {};

  try {
    return JSON.parse(tab.cachedFilters) as SearchFilters;
  } catch {
    return {};
  }
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

      if (cardsToRestore.length > 0) {
        await invokeCommand('modify_cards', {
          request: {
            tabId: tab.id,
            cards: cardsToRestore.map((card) => cloneCard(card)),
          },
        });
      }

      if (deletedIds.length > 0) {
        await invokeCommand('delete_cards', {
          request: {
            tabId: tab.id,
            cardIds: deletedIds,
          },
        });
      }
    } else if (operation.deletedCards.length > 0) {
      await invokeCommand('modify_cards', {
        request: {
          tabId: tab.id,
          cards: operation.deletedCards.map((card) => cloneCard(card)),
        },
      });
    }

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

/** Modify (upsert) a card in the active tab's working CDB */
export async function modifyCard(card: CardDataEntry): Promise<boolean> {
  return modifyCards([card]);
}

export async function modifyCardsInTab(tabId: string, cards: CardDataEntry[]): Promise<boolean> {
  const tab = get(tabs).find((item) => item.id === tabId);
  if (!tab) return false;

  try {
    const previousCards = await Promise.all(cards.map((card) => getCardByIdInTab(tab.id, card.code)));
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
      previousCards: previousCards.map((card) => card ?? null),
    });
    syncCachedCardsInTab(tab.id, cards);
    markTabDirty(tab.id, true);
    return true;
  } catch (err) {
    console.error('Failed to modify cards:', err);
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
    const deletedCards = (await Promise.all(cardIds.map((cardId) => getCardByIdInTab(tab.id, cardId))))
      .filter((card): card is CardDataEntry => card !== undefined)
      .map((card) => cloneCard(card));

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
    markActiveTabDirty(true);
    return true;
  } catch (err) {
    console.error("Failed to delete cards:", err);
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
export async function searchCardsPage(filters: SearchFilters = {}, page = 1, pageSize = 50): Promise<{ cards: CardDataEntry[]; total: number }> {
  const tab = get(activeTab);
  if (!tab) return { cards: [], total: 0 };

  try {
    const { whereClause, params } = buildSearchQuery(filters);
    const safePage = Math.max(1, page);
    const response = await invokeCommand<SearchCardsPageResponse>('search_cards_page', {
      request: {
        tabId: tab.id,
        whereClause,
        params,
        page: safePage,
        pageSize,
      },
    });

    tabs.update((currentTabs) =>
      currentTabs.map((item) =>
        item.id === tab.id
          ? {
              ...item,
              cachedCards: response.cards,
              cachedTotal: response.total,
              cachedPage: safePage,
              cachedFilters: JSON.stringify(filters),
            }
          : item
      )
    );

    return response;
  } catch (err) {
    if (err instanceof RuleExpressionError) {
      throw err;
    }
    console.error("Search failed:", err);
    return { cards: [], total: 0 };
  }
}
