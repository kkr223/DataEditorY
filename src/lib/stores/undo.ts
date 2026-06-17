import type { CardDataEntry } from '$lib/types';

export type UndoOperation =
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
const undoLabels = new Map<string, string[]>();

export function getUndoStack(tabId: string): UndoOperation[] {
  let stack = undoHistory.get(tabId);
  if (!stack) {
    stack = [];
    undoHistory.set(tabId, stack);
  }
  return stack;
}

export function pushUndoOperation(tabId: string, operation: UndoOperation): void {
  const stack = getUndoStack(tabId);
  stack.push(operation);
  if (stack.length > 100) {
    stack.shift();
  }
}

export function clearUndoHistory(tabId: string): void {
  undoHistory.delete(tabId);
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
