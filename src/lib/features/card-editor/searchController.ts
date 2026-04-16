import type { CardDataEntry, SearchFilters } from '$lib/types';
import { buildSearchFiltersFromDraft } from './controller';

type SearchFromDraftInput = {
  isDbLoaded: boolean;
  draftCard: CardDataEntry;
  setSearchFilters: (filters: SearchFilters) => void;
  runSearch: (preserveSelection?: boolean, resetPage?: boolean) => Promise<unknown>;
};

type ResetSearchInput = {
  isDbLoaded: boolean;
  runReset: () => Promise<unknown>;
  clearSelection: () => void;
  resetDraftCard: () => void;
};

export async function handleSearchFromDraft(input: SearchFromDraftInput) {
  if (!input.isDbLoaded) return;

  input.setSearchFilters(buildSearchFiltersFromDraft(input.draftCard));
  await input.runSearch(false, true);
}

export async function handleResetSearch(input: ResetSearchInput) {
  if (!input.isDbLoaded) return;

  await input.runReset();
  input.clearSelection();
  input.resetDraftCard();
}
