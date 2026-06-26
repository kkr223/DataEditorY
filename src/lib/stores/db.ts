export { cloneCard, cloneCards } from './cardUtils';

export {
  type RecentCdbEntry,
  recentCdbHistory,
  loadRecentCdbHistory,
  removeRecentCdbHistoryEntry,
} from './recentHistory';

export { type UndoOperation } from './undo';

export {
  type CachedSearchSnapshot,
  onCachedSearchRefreshed,
  queryCardsByFiltersInTab,
  searchCardsPageInTab,
  searchCardsPage,
  clearSourceFilterCacheForTab,
  clearAllSourceFilterCaches,
} from './search';

export {
  type CdbTab,
  tabs,
  activeTabId,
  activeTab,
  isDbLoaded,
  openCdbPath,
  openCdbFile,
  openCdbHistoryEntry,
  createCdbFile,
  closeTab,
  saveCdbFile,
  saveCdbTab,
  saveCdbTabAs,
  getCachedCards,
  getCachedTotal,
  getCachedPage,
  getCachedFilters,
  getCachedSelectedIds,
  getCachedSelectedId,
  getCachedSelectionAnchorId,
  cacheActiveTabSelection,
  hasUnsavedChanges,
  markActiveTabDirty,
  hasUndoableAction,
  getLastUndoLabel,
  undoLastOperation,
  undoLastOperationInTab,
} from './tabs';

export {
  getCardById,
  getCardByIdInTab,
  getCardsByIdsInTab,
  getCardsByIds,
  modifyCard,
  modifyCardsInTab,
  modifyCardsWithSnapshotInTab,
  modifyCards,
  deleteCard,
  deleteCards,
  deleteCardsWithSnapshotInTab,
} from './cardOperations';
