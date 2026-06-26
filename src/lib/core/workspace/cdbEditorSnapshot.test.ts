import { describe, expect, test } from 'bun:test';
import { DEFAULT_SEARCH_FILTERS } from '$lib/types';
import type { DbWorkspaceState } from '$lib/types';
import { createCdbEditorSnapshot } from './cdbEditorSnapshot';

const createTab = (overrides: Partial<DbWorkspaceState> = {}): DbWorkspaceState => ({
  id: 'tab-1',
  path: 'D:/cards.cdb',
  name: 'cards.cdb',
  cachedCards: [],
  cachedTotal: 0,
  cachedPage: 1,
  cachedFilters: '{}',
  cachedSelectedIds: [],
  cachedSelectedId: null,
  cachedSelectionAnchorId: null,
  isDirty: false,
  ...overrides,
});

describe('createCdbEditorSnapshot', () => {
  test('restores independent search and selection state for a CDB tab', () => {
    const snapshot = createCdbEditorSnapshot(createTab({
      cachedTotal: 1,
      cachedPage: 3,
      cachedFilters: JSON.stringify({ nameOrDesc: 'dragon', type: 'monster' }),
      cachedSelectedIds: [1001],
      cachedSelectedId: 1001,
      cachedSelectionAnchorId: 1001,
    }));

    expect(snapshot.total).toBe(1);
    expect(snapshot.page).toBe(3);
    expect(snapshot.filters).toEqual({
      ...DEFAULT_SEARCH_FILTERS,
      nameOrDesc: 'dragon',
      type: 'monster',
    });
    expect(snapshot.selectedIds).toEqual([1001]);
    expect(snapshot.selectedId).toBe(1001);
  });

  test('falls back to an empty filter set when cached JSON is invalid', () => {
    const snapshot = createCdbEditorSnapshot(createTab({
      cachedPage: 0,
      cachedTotal: -1,
      cachedFilters: '{broken',
    }));

    expect(snapshot.page).toBe(1);
    expect(snapshot.total).toBe(0);
    expect(snapshot.filters).toEqual(DEFAULT_SEARCH_FILTERS);
  });
});
