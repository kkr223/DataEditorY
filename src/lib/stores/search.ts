import { get } from 'svelte/store';
import type { CardDataEntry, SearchFilters } from '$lib/types';
import { DEFAULT_SEARCH_FILTERS } from '$lib/types';
import { parseDeckTextToCardIds, splitSourceTerms } from '$lib/domain/search/sourceFilters';
import { RuleExpressionError } from '$lib/domain/search/ruleExpression';
import { listImageFolderEntries } from '$lib/infrastructure/tauri/commands';
import { documentRuntime } from '$lib/platform/appRuntime';
import {
  buildCardSearchExpression,
  type CardCollectionQuery,
  type CardSearchPage,
} from '$lib/modules/card';
import { cloneCards } from './cardUtils';
import { activeTab, tabs } from './tabs';

export interface CachedSearchSnapshot {
  tabId: string;
  cards: CardDataEntry[];
  total: number;
  page: number;
  filters: SearchFilters;
}

interface SearchCardsPageResponse {
  cards: CardDataEntry[];
  total: number;
}

interface ResolvedSourceFilterIds {
  active: boolean;
  ids: number[];
}

const SEARCH_PAGE_SIZE = 50;
const EXACT_NAME_CHUNK_SIZE = 100;
const cachedSearchRefreshListeners = new Set<(snapshot: CachedSearchSnapshot) => void>();

// Source-filter resolution caches (module-level, in-memory)
// Key for deckTextCache:       trimmed deckText string
// Key for imageFolderCache:    `${tabId}|${normalizedPath}`
const CACHE_MAX_SIZE = 200;
const deckTextCache = new Map<string, number[]>();
const imageFolderCache = new Map<string, number[]>();

/** Insert into a bounded Map (FIFO eviction when over capacity). */
function boundedSet<K, V>(map: Map<K, V>, key: K, value: V): void {
  if (map.size >= CACHE_MAX_SIZE) {
    const oldestKey = map.keys().next().value;
    if (oldestKey !== undefined) {
      map.delete(oldestKey);
    }
  }
  map.set(key, value);
}

/** Clear the image-folder cache entries for a specific tab (call on reset / data mutation / tab close). */
export function clearSourceFilterCacheForTab(tabId: string): void {
  const prefix = `${tabId}|`;
  for (const key of imageFolderCache.keys()) {
    if (key.startsWith(prefix)) {
      imageFolderCache.delete(key);
    }
  }
}

/** Clear all source-filter caches (both deckText and imageFolder). */
export function clearAllSourceFilterCaches(): void {
  deckTextCache.clear();
  imageFolderCache.clear();
}

export function parseCachedFiltersJson(serialized: string): SearchFilters {
  try {
    return { ...DEFAULT_SEARCH_FILTERS, ...JSON.parse(serialized) as Partial<SearchFilters> };
  } catch {
    return { ...DEFAULT_SEARCH_FILTERS };
  }
}

function updateCachedSearchSnapshot(snapshot: CachedSearchSnapshot) {
  const clonedCards = cloneCards(snapshot.cards);
  let tabExists = false;
  tabs.update((currentTabs) => {
    const result = currentTabs.map((item) =>
      item.id === snapshot.tabId
        ? {
            ...item,
            cachedCards: clonedCards,
            cachedTotal: snapshot.total,
            cachedPage: snapshot.page,
            cachedFilters: JSON.stringify(snapshot.filters),
          }
        : item
    );
    tabExists = result.some((item) => item.id === snapshot.tabId);
    return result;
  });

  // If the tab was closed between the search request and this response,
  // do not notify listeners with stale data.
  if (!tabExists) return;

  const listenerSnapshot: CachedSearchSnapshot = {
    ...snapshot,
    cards: clonedCards,
  };
  for (const listener of cachedSearchRefreshListeners) {
    listener(listenerSnapshot);
  }
}

export async function searchCardsPageInTab(
  tabId: string,
  filters: SearchFilters,
  page = 1,
  pageSize = SEARCH_PAGE_SIZE,
): Promise<{ cards: CardDataEntry[]; total: number }> {
  const resolvedSourceFilterIds = await resolveSourceFilterIds(tabId, filters);
  const safePage = Math.max(1, page);
  const response = await documentRuntime.query<CardSearchPage>(
    tabId,
    {
      kind: 'search',
      expression: buildCardSearchExpression(
        filters,
        resolvedSourceFilterIds.active ? resolvedSourceFilterIds.ids : undefined,
      ),
      page: safePage,
      pageSize,
    } satisfies CardCollectionQuery,
  );

  // The IPC response is already a freshly deserialized array; cloning it
  // here would be redundant — `updateCachedSearchSnapshot` clones once for
  // the tab cache before any listener sees the cards, and callers that need
  // an isolated copy take their own. Returning the original avoids a second
  // full-page deep clone on every search.
  return {
    cards: response.cards,
    total: response.total,
  };
}

async function resolveCardIdsByExactNames(tabId: string, names: string[]): Promise<number[]> {
  const normalizedNames = [...new Set(names.map((name) => name.trim()).filter(Boolean))];
  if (normalizedNames.length === 0) {
    return [];
  }

  const ids = new Set<number>();
  for (let index = 0; index < normalizedNames.length; index += EXACT_NAME_CHUNK_SIZE) {
    const chunk = normalizedNames.slice(index, index + EXACT_NAME_CHUNK_SIZE);
    const cards = await documentRuntime.query<CardDataEntry[]>(
      tabId,
      { kind: 'findByNames', names: chunk } satisfies CardCollectionQuery,
    );
    for (const card of cards) {
      ids.add(card.code);
    }
  }

  return [...ids];
}

function intersectIdSets(left: number[], right: number[]): number[] {
  const rightSet = new Set(right);
  return left.filter((id) => rightSet.has(id));
}

async function resolveSourceFilterIds(tabId: string, filters: SearchFilters): Promise<ResolvedSourceFilterIds> {
  const hasDeckText = filters.deckText.trim() !== '';
  const hasImageFolderPath = filters.imageFolderPath.trim() !== '';

  if (!hasDeckText && !hasImageFolderPath) {
    return { active: false, ids: [] };
  }

  let currentIds: number[] | null = null;

  if (hasDeckText) {
    const deckKey = filters.deckText.trim();
    const cached = deckTextCache.get(deckKey);
    if (cached !== undefined) {
      currentIds = cached;
    } else {
      const resolved = parseDeckTextToCardIds(filters.deckText);
      boundedSet(deckTextCache, deckKey, resolved);
      currentIds = resolved;
    }
  }

  if (hasImageFolderPath) {
    const normalizedPath = filters.imageFolderPath.trim();
    const imageKey = `${tabId}|${normalizedPath}`;
    const cached = imageFolderCache.get(imageKey);
    let imageIds: number[];
    if (cached !== undefined) {
      imageIds = cached;
    } else {
      const entries = await listImageFolderEntries(normalizedPath);
      const split = splitSourceTerms(entries);
      const exactNameIds = await resolveCardIdsByExactNames(tabId, split.names);
      imageIds = [...new Set([...split.ids, ...exactNameIds])];
      boundedSet(imageFolderCache, imageKey, imageIds);
    }
    currentIds = currentIds === null ? imageIds : intersectIdSets(currentIds, imageIds);
  }

  return {
    active: true,
    ids: currentIds ?? [],
  };
}

export async function refreshCachedSearchForTab(tabId: string): Promise<boolean> {
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

export async function queryCardsByFiltersInTab(tabId: string, filters: SearchFilters): Promise<CardDataEntry[]> {
  const resolvedSourceFilterIds = await resolveSourceFilterIds(tabId, filters);
  const cards: CardDataEntry[] = [];
  const expression = buildCardSearchExpression(
    filters,
    resolvedSourceFilterIds.active ? resolvedSourceFilterIds.ids : undefined,
  );
  let page = 1;
  while (true) {
    const response = await documentRuntime.query<CardSearchPage>(
      tabId,
      {
        kind: 'search',
        expression,
        page,
        pageSize: 200,
      } satisfies CardCollectionQuery,
    );
    cards.push(...response.cards);
    if (cards.length >= response.total || response.cards.length === 0) {
      return cloneCards(cards);
    }
    page += 1;
  }
}

export async function searchCardsPage(
  filters: SearchFilters = DEFAULT_SEARCH_FILTERS,
  page = 1,
  pageSize = 50,
): Promise<{ cards: CardDataEntry[]; total: number }> {
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
    console.error('Search failed:', err);
    return { cards: [], total: 0 };
  }
}
