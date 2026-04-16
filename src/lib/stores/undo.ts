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
}
