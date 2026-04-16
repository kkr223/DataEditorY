/**
 * Shell helper functions keep layout lifecycle focused on orchestration while
 * preserving pure, testable logic for path filtering and target inspection.
 */
export type DragDropPayload = {
  paths?: string[];
};

type UndoTargetDescriptor = {
  tagName: string;
  inputType?: string;
  isContentEditable: boolean;
  insideMonaco: boolean;
  insideContentEditable: boolean;
};

export function isCdbFilePath(path: string) {
  return path.trim().toLowerCase().endsWith('.cdb');
}

export function normalizeExternalOpenPaths(paths: string[] = []) {
  return Array.from(
    new Set(
      paths
        .map((item) => item.trim())
        .filter((item) => item && isCdbFilePath(item))
    )
  );
}

function toElement(target: EventTarget | null): HTMLElement | null {
  if (target instanceof HTMLElement) return target;
  if (target instanceof Node) {
    return target.parentElement;
  }
  return null;
}

function describeUndoTarget(element: HTMLElement | null): UndoTargetDescriptor | null {
  if (!element) return null;

  return {
    tagName: element.tagName.toLowerCase(),
    inputType: element instanceof HTMLInputElement ? element.type.toLowerCase() : undefined,
    isContentEditable: element.isContentEditable,
    insideMonaco: Boolean(element.closest('.monaco-editor, .monaco-diff-editor')),
    insideContentEditable: Boolean(element.closest('[contenteditable="true"]')),
  };
}

export function isNativeTextUndoDescriptor(descriptor: UndoTargetDescriptor | null): boolean {
  if (!descriptor) return false;

  if (descriptor.insideMonaco || descriptor.isContentEditable || descriptor.insideContentEditable) {
    return true;
  }

  if (descriptor.tagName === 'textarea') {
    return true;
  }

  if (descriptor.tagName === 'input') {
    const type = descriptor.inputType ?? 'text';
    return !['button', 'checkbox', 'color', 'file', 'image', 'radio', 'range', 'reset', 'submit'].includes(type);
  }

  return false;
}

export function isNativeTextUndoTarget(target: EventTarget | null): boolean {
  const candidates = [toElement(target), toElement(document.activeElement)];

  return candidates.some((element) => isNativeTextUndoDescriptor(describeUndoTarget(element)));
}

export function isEditableTarget(target: EventTarget | null): boolean {
  const candidates = [toElement(target), toElement(document.activeElement)];

  return candidates.some((element) =>
    Boolean(
      element
      && (
        element.isContentEditable
        || element.matches('input, textarea, select, [contenteditable="true"]')
        || !!element.closest('input, textarea, select, [contenteditable="true"], .monaco-editor, .monaco-diff-editor')
      ),
    ),
  );
}
