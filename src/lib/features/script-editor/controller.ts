import type { CardDataEntry, ScriptWorkspaceState } from '$lib/types';
import type { LuaCallHighlight } from '$lib/utils/luaScriptCalls';
import { toPersistableCard } from '$lib/domain/card/draft';

export type HintPlacement = 'top' | 'bottom';

export type MonacoDecorationRange = {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
};

export type MonacoDecoration = {
  range: MonacoDecorationRange;
  options: {
    inlineClassName: string;
  };
};

export function normalizeScriptCardContext(card: CardDataEntry | null | undefined) {
  if (!card) {
    return null;
  }

  return toPersistableCard(card);
}

export function buildScriptEditorContextKey(input: {
  activeScriptTab: ScriptWorkspaceState | null;
  dbTabs: Array<{ id: string; path: string }>;
}) {
  return [
    input.activeScriptTab?.id ?? '',
    input.activeScriptTab?.cdbPath ?? '',
    String(input.activeScriptTab?.cardCode ?? 0),
    input.activeScriptTab?.sourceTabId ?? '',
    input.dbTabs.map((item) => `${item.id}:${item.path}`).join('|'),
  ].join('::');
}

export function resolveHintAnchor(input: {
  hostOffsetTop?: number;
  visibleTop?: number;
  visibleHeight?: number;
} | null | undefined) {
  if (
    !input
    || typeof input.hostOffsetTop !== 'number'
    || typeof input.visibleTop !== 'number'
    || typeof input.visibleHeight !== 'number'
  ) {
    return { top: 12, placement: 'top' as const };
  }

  const anchorTop = input.hostOffsetTop + 1 + input.visibleTop;
  const placement: HintPlacement = anchorTop <= Math.max(input.visibleHeight * 5, 132)
    ? 'bottom'
    : 'top';

  return {
    top: placement === 'bottom' ? anchorTop + input.visibleHeight : anchorTop,
    placement,
  } as const;
}

export function resolveHoverAbove(input: {
  visibleTop?: number;
  visibleHeight?: number;
  previous: boolean;
}) {
  if (typeof input.visibleTop !== 'number' || typeof input.visibleHeight !== 'number') {
    return input.previous;
  }

  return input.visibleTop > Math.max(input.visibleHeight * 4, 96);
}

export function shouldHandleHintSuppressShortcut(event: KeyboardEvent, hasEditorTextFocus: boolean) {
  return event.key === 'Alt' && hasEditorTextFocus;
}

export function extractFocusedSuggestLabel(editorHost: ParentNode | null) {
  if (!editorHost) {
    return null;
  }

  const focusedRow = editorHost.querySelector('.suggest-widget .monaco-list-row.focused');
  if (!(focusedRow instanceof HTMLElement)) {
    return null;
  }

  const labelNode = focusedRow.querySelector('.label-name');
  if (labelNode instanceof HTMLElement) {
    return labelNode.textContent?.trim() || null;
  }

  const iconLabel = focusedRow.querySelector('.monaco-icon-label');
  if (iconLabel instanceof HTMLElement) {
    return iconLabel.textContent?.trim() || null;
  }

  return focusedRow.getAttribute('aria-label')?.split(',')[0]?.trim() || null;
}

export function buildCallHighlightDecorations(
  source: string,
  lastHighlightSource: string,
  lastHighlightDecorations: MonacoDecoration[],
  collectHighlights: (source: string) => LuaCallHighlight[],
) {
  if (source === lastHighlightSource) {
    return {
      source,
      decorations: lastHighlightDecorations,
    };
  }

  return {
    source,
    decorations: collectHighlights(source).map((item) => ({
      range: {
        startLineNumber: item.startLineNumber,
        startColumn: item.startColumn,
        endLineNumber: item.endLineNumber,
        endColumn: item.endColumn,
      },
      options: {
        inlineClassName: 'lua-call-highlight',
      },
    })),
  };
}
