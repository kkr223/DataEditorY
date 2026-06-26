import { DEFAULT_SEARCH_FILTERS } from '$lib/types';
import type { DbWorkspaceState, SearchFilters } from '$lib/types';

export type CdbEditorSnapshot = {
  cards: DbWorkspaceState['cachedCards'];
  total: number;
  page: number;
  filters: SearchFilters;
  selectedIds: number[];
  selectedId: number | null;
  selectionAnchorId: number | null;
};

const parseFilters = (serialized: string): SearchFilters => {
  try {
    return {
      ...DEFAULT_SEARCH_FILTERS,
      ...JSON.parse(serialized) as Partial<SearchFilters>,
    };
  } catch {
    return { ...DEFAULT_SEARCH_FILTERS };
  }
};

export const createCdbEditorSnapshot = (tab: DbWorkspaceState): CdbEditorSnapshot => ({
  cards: tab.cachedCards,
  total: Math.max(0, tab.cachedTotal),
  page: Math.max(1, tab.cachedPage || 1),
  filters: parseFilters(tab.cachedFilters),
  selectedIds: [...tab.cachedSelectedIds],
  selectedId: tab.cachedSelectedId,
  selectionAnchorId: tab.cachedSelectionAnchorId,
});
