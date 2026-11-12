const undoLabels = new Map<string, string[]>();

export function clearUndoHistory(tabId: string): void {
  undoLabels.delete(tabId);
}

export function pushUndoLabel(tabId: string, label: string): void {
  const stack = undoLabels.get(tabId) ?? [];
  stack.push(label);
  if (stack.length > 100) {
    stack.shift();
  }
  undoLabels.set(tabId, stack);
}

export function popUndoLabel(tabId: string): string | null {
  return undoLabels.get(tabId)?.pop() ?? null;
}

export function getUndoLabels(tabId: string): string[] {
  return undoLabels.get(tabId) ?? [];
}
