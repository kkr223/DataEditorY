/**
 * Shell helper functions keep layout lifecycle focused on orchestration while
 * preserving pure, testable logic for path filtering and target inspection.
 */
export type DragDropPayload = {
  paths?: string[];
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
