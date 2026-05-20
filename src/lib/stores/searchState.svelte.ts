import { DEFAULT_SEARCH_FILTERS } from '$lib/types';
import type { SearchFilters } from '$lib/types';

export const searchState = $state<{
  currentPage: number;
  filters: SearchFilters;
  error: string;
  isFilterOpen: boolean;
}>({
  currentPage: 1,
  filters: { ...DEFAULT_SEARCH_FILTERS },
  error: '',
  isFilterOpen: false,
});

export function clearSearchError() {
  searchState.error = '';
}

export function resetSearchState() {
  searchState.filters = { ...DEFAULT_SEARCH_FILTERS };
  searchState.error = '';
  searchState.currentPage = 1;
}
