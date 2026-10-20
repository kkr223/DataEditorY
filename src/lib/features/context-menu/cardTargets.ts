export function resolveContextCardIds(clickedId: number, selectedIds: readonly number[]) {
  return selectedIds.includes(clickedId) ? [...selectedIds] : [clickedId];
}

export function getTabsToClose<T extends { id: string; kind: string }>(tabs: readonly T[], targetId: string, scope: 'others' | 'right') {
  const index = tabs.findIndex((tab) => tab.id === targetId);
  if (index < 0) return [];
  return tabs.filter((tab, position) => tab.kind === 'db' && tab.id !== targetId && (scope === 'others' || position > index));
}
