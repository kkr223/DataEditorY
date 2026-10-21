export type ScriptPair = { leftId: string; rightId: string };

export function groupScriptTabs<T extends { id: string }>(tabs: readonly T[], pair: ScriptPair | null): T[][] {
  const left = tabs.find((tab) => tab.id === pair?.leftId);
  const right = tabs.find((tab) => tab.id === pair?.rightId);
  if (!left || !right || left.id === right.id) return tabs.map((tab) => [tab]);
  const groups: T[][] = [];
  let added = false;
  for (const tab of tabs) {
    if (tab.id !== left.id && tab.id !== right.id) groups.push([tab]);
    else if (!added) { groups.push([left, right]); added = true; }
  }
  return groups;
}

export function getPairSurvivor(pair: ScriptPair | null, closedId: string) {
  if (pair?.leftId === closedId) return pair.rightId;
  if (pair?.rightId === closedId) return pair.leftId;
  return null;
}
