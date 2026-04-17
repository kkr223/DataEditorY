<script module lang="ts">
  export type ScriptEditorCoreHintState = {
    suggestHintText: string;
    suggestHintPlacement: 'top' | 'bottom';
    suggestHintAnchorTop: number;
    currentFunctionHintTitle: string;
    currentFunctionHintDescription: string;
    isCurrentFunctionHintSuppressed: boolean;
    currentFunctionHintPlacement: 'top' | 'bottom';
    currentFunctionHintAnchorTop: number;
  };

  export type ScriptEditorCoreReferenceState = {
    kind: import('$lib/features/script-editor/controller').ScriptReferenceManualKind | null;
    isLoading: boolean;
    items: Record<
      import('$lib/features/script-editor/controller').ScriptReferenceManualKind,
      import('$lib/utils/luaReferenceManual').LuaReferenceManualItem[]
    >;
  };
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onDestroy, onMount, untrack } from 'svelte';
  import { activeScriptTab, getActiveScriptTab, setScriptTabViewState, updateScriptTabContent } from '$lib/stores/scriptEditor.svelte';
  import { activeTabId, tabs } from '$lib/stores/db';
  import { collectLuaInlineHighlights } from '$lib/utils/luaScriptCalls';
  import type { CardDataEntry } from '$lib/types';
  import type { editor as MonacoEditor } from 'monaco-editor';
  import { normalizeCardStrings } from '$lib/domain/card/draft';
  import {
    buildCallHighlightDecorations,
    buildScriptEditorContextKey,
    extractFocusedSuggestLabel,
    resolveHintAnchor,
    resolveHoverAbove,
    resolveScriptReferenceShortcut,
    shouldCloseScriptReferenceOverlay,
    shouldHandleHintSuppressShortcut,
    type ScriptReferenceManualKind,
  } from '$lib/features/script-editor/controller';
  import { loadScriptCardContextFlow, saveScriptStringFlow, type ScriptImageSelection } from '$lib/features/script-editor/useCases';
  import {
    createScriptMonacoRuntime,
    type ScriptMonacoApi as MonacoApi,
    type ScriptMonacoModule as MonacoModule,
    type ScriptMonacoRuntime,
  } from '$lib/features/script-editor/runtime';
  import { resolveReferenceManualInsertText, type LuaReferenceManualItem } from '$lib/utils/luaReferenceManual';

  function createDefaultHintState(): ScriptEditorCoreHintState {
    return {
      suggestHintText: '',
      suggestHintPlacement: 'top',
      suggestHintAnchorTop: 12,
      currentFunctionHintTitle: '',
      currentFunctionHintDescription: '',
      isCurrentFunctionHintSuppressed: false,
      currentFunctionHintPlacement: 'top',
      currentFunctionHintAnchorTop: 12,
    };
  }

  function createDefaultReferenceState(): ScriptEditorCoreReferenceState {
    return {
      kind: null,
      isLoading: false,
      items: {
        constants: [],
        functions: [],
      },
    };
  }

  let {
    cardContext = $bindable<CardDataEntry | null>(null),
    hasSelectedCode = $bindable(false),
    hintState = $bindable<ScriptEditorCoreHintState>(createDefaultHintState()),
    referenceState = $bindable<ScriptEditorCoreReferenceState>(createDefaultReferenceState()),
    children,
  } = $props<{
    cardContext?: CardDataEntry | null;
    hasSelectedCode?: boolean;
    hintState?: ScriptEditorCoreHintState;
    referenceState?: ScriptEditorCoreReferenceState;
    children?: Snippet;
  }>();

  let editorHost = $state<HTMLDivElement | null>(null);
  let monacoModule = $state<MonacoModule | null>(null);
  let monacoApi = $state<MonacoApi | null>(null);
  let editorInstance = $state<MonacoEditor.IStandaloneCodeEditor | null>(null);
  let callHighlightDecorations = $state<MonacoEditor.IEditorDecorationsCollection | null>(null);
  let monacoRuntime = $state<ScriptMonacoRuntime | null>(null);
  let currentBoundTabId = $state<string | null>(null);
  let isApplyingModel = false;
  let isMonacoReady = $state(false);
  let loadContextToken = 0;
  let lastContextKey = $state('');
  let savedScriptStrings = $state<string[]>(Array.from({ length: 16 }, () => ''));
  let referenceSelection = $state<ReturnType<MonacoEditor.IStandaloneCodeEditor['getSelection']>>(null);
  let hoverAbove = true;
  let suggestHintTimer: ReturnType<typeof setTimeout> | null = null;
  let validateTimer: ReturnType<typeof setTimeout> | null = null;
  let lastHighlightSource = '';
  let lastHighlightDecorations = $state<{
    range: {
      startLineNumber: number;
      startColumn: number;
      endLineNumber: number;
      endColumn: number;
    };
    options: {
      inlineClassName: string;
    };
  }[]>([]);

  const scriptStrings = $derived.by(() => Array.from({ length: 16 }, (_, index) => cardContext?.strings[index] ?? ''));

  function updateHintState(patch: Partial<ScriptEditorCoreHintState>) {
    const current = untrack(() => hintState);
    const next = {
      ...current,
      ...patch,
    };

    if (
      next.suggestHintText === current.suggestHintText
      && next.suggestHintPlacement === current.suggestHintPlacement
      && next.suggestHintAnchorTop === current.suggestHintAnchorTop
      && next.currentFunctionHintTitle === current.currentFunctionHintTitle
      && next.currentFunctionHintDescription === current.currentFunctionHintDescription
      && next.isCurrentFunctionHintSuppressed === current.isCurrentFunctionHintSuppressed
      && next.currentFunctionHintPlacement === current.currentFunctionHintPlacement
      && next.currentFunctionHintAnchorTop === current.currentFunctionHintAnchorTop
    ) {
      return;
    }

    hintState = next;
  }

  function updateReferenceState(patch: Partial<ScriptEditorCoreReferenceState>) {
    const current = untrack(() => referenceState);
    const next = {
      ...current,
      ...patch,
    };

    if (
      next.kind === current.kind
      && next.isLoading === current.isLoading
      && next.items.constants === current.items.constants
      && next.items.functions === current.items.functions
    ) {
      return;
    }

    referenceState = next;
  }

  function clearSuggestHint() {
    updateHintState({
      suggestHintText: '',
      suggestHintPlacement: 'top',
      suggestHintAnchorTop: 12,
    });
    if (suggestHintTimer) {
      clearTimeout(suggestHintTimer);
      suggestHintTimer = null;
    }
  }

  function clearCurrentFunctionHint() {
    updateHintState({
      currentFunctionHintTitle: '',
      currentFunctionHintDescription: '',
      isCurrentFunctionHintSuppressed: false,
      currentFunctionHintPlacement: 'top',
      currentFunctionHintAnchorTop: 12,
    });
  }

  async function loadCardContext() {
    const tab = getActiveScriptTab();
    if (!tab) {
      cardContext = null;
      savedScriptStrings = Array.from({ length: 16 }, () => '');
      return;
    }

    const currentToken = ++loadContextToken;
    const result = await loadScriptCardContextFlow({
      tab,
      dbTabs: $tabs,
      loadToken: currentToken,
    });
    if (result.loadToken !== loadContextToken) return;

    cardContext = result.cardContext;
    savedScriptStrings = result.savedScriptStrings;
  }

  async function ensureReferenceManualItems(kind: ScriptReferenceManualKind) {
    if (referenceState.items[kind].length > 0) {
      return;
    }

    updateReferenceState({ isLoading: true });
    try {
      const module = await import('$lib/utils/luaReferenceManual');
      updateReferenceState({
        items: {
          ...referenceState.items,
          [kind]: await module.loadReferenceManualItems(kind),
        },
      });
    } finally {
      updateReferenceState({ isLoading: false });
    }
  }

  async function openReferenceOverlay(kind: ScriptReferenceManualKind) {
    referenceSelection = editorInstance?.getSelection() ?? null;
    updateReferenceState({ kind });
    await ensureReferenceManualItems(kind);
  }

  export function closeReferenceOverlay() {
    updateReferenceState({ kind: null });
  }

  export function insertReferenceItem(item: LuaReferenceManualItem) {
    if (!editorInstance || !monacoModule) return;

    if (referenceSelection) {
      editorInstance.setSelection(referenceSelection);
    }
    editorInstance.focus();

    const selection = editorInstance.getSelection();
    const model = editorInstance.getModel();
    const shouldUseMethodSyntax = Boolean(selection?.isEmpty() && model && selection && (() => {
      const linePrefix = model.getLineContent(selection.startLineNumber).slice(0, selection.startColumn - 1);
      const trimmedPrefix = linePrefix.replace(/\s+$/, '');
      return trimmedPrefix.endsWith(':');
    })());
    const inserted = monacoModule.insertSnippet(
      editorInstance,
      resolveReferenceManualInsertText(item, {
        useMethodSyntax: shouldUseMethodSyntax,
      }),
    );
    if (!inserted) return;

    referenceSelection = editorInstance.getSelection() ?? null;
    closeReferenceOverlay();
    refreshCurrentFunctionHint();
    refreshSuggestHint();
  }

  export function insertStringId(index: number) {
    if (!editorInstance || !monacoModule) return;
    const inserted = monacoModule.insertSnippet(editorInstance, `aux.Stringid(id,${index})`);
    if (inserted) {
      editorInstance.focus();
      refreshCurrentFunctionHint();
      refreshSuggestHint();
    }
  }

  export function updateStringInput(index: number, value: string) {
    if (!cardContext) return;
    const nextStrings = normalizeCardStrings(cardContext.strings);
    nextStrings[index] = value;
    cardContext = {
      ...cardContext,
      strings: nextStrings,
    };
  }

  export async function persistString(index: number) {
    const result = await saveScriptStringFlow({
      tab: getActiveScriptTab(),
      cardContext,
      savedScriptStrings,
      index,
      dbTabs: $tabs,
      activeDbTabId: $activeTabId,
      t: (key, options) => options ? key : key,
    });
    if (!result) return;

    cardContext = result.cardContext;
    savedScriptStrings = result.savedScriptStrings;
  }

  export function getScriptImageSelection(): ScriptImageSelection | null {
    const selection = editorInstance?.getSelection();
    const model = editorInstance?.getModel();
    if (!selection || !model || selection.isEmpty()) {
      hasSelectedCode = false;
      return null;
    }

    const startLineNumber = selection.startLineNumber;
    const inclusiveEndLineNumber = selection.endColumn === 1 && selection.endLineNumber > startLineNumber
      ? selection.endLineNumber - 1
      : selection.endLineNumber;
    const endLineNumber = Math.max(startLineNumber, inclusiveEndLineNumber);
    const lines = [];
    for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber += 1) {
      lines.push(model.getLineContent(lineNumber));
    }

    hasSelectedCode = lines.length > 0;
    if (lines.length === 0) {
      return null;
    }

    return {
      content: lines.join('\n'),
      startLineNumber,
    } satisfies ScriptImageSelection;
  }

  async function syncEditorWithActiveTab() {
    if (!editorInstance || !monacoModule || !monacoApi) return;

    const tab = getActiveScriptTab();
    if (!tab) {
      currentBoundTabId = null;
      closeReferenceOverlay();
      editorInstance.setModel(null);
      hasSelectedCode = false;
      return;
    }

    if (currentBoundTabId && currentBoundTabId !== tab.id) {
      setScriptTabViewState(currentBoundTabId, editorInstance.saveViewState());
    }

    const uri = monacoModule.createScriptModelUri(tab.id);
    let model = monacoApi.editor.getModel(uri);
    const currentModel = editorInstance.getModel();
    const isSwitchingTab = currentBoundTabId !== tab.id || currentModel?.uri.toString() !== uri.toString();

    if (!model) {
      model = monacoApi.editor.createModel(tab.content, 'lua', uri);
    } else if (model.getValue() !== tab.content) {
      isApplyingModel = true;
      model.setValue(tab.content);
      isApplyingModel = false;
    }

    monacoModule.setModelContext(model, {
      cardCode: tab.cardCode,
      cardName: tab.cardName,
      strings: scriptStrings,
      card: cardContext,
    });
    scheduleModelValidation();

    if (isSwitchingTab) {
      editorInstance.setModel(model);
      if (tab.viewState) {
        editorInstance.restoreViewState(tab.viewState as MonacoEditor.ICodeEditorViewState);
      } else {
        editorInstance.setScrollTop(0);
        editorInstance.setPosition({ lineNumber: 1, column: 1 });
      }
      editorInstance.focus();
    } else if (currentModel?.uri.toString() !== model.uri.toString()) {
      editorInstance.setModel(model);
    }

    currentBoundTabId = tab.id;
    syncSelectionState();
  }

  function handleHintSuppressKeydown(event: KeyboardEvent) {
    if (!shouldHandleHintSuppressShortcut(event, Boolean(editorInstance?.hasTextFocus()))) return;
    updateHintState({ isCurrentFunctionHintSuppressed: true });
  }

  function handleHintSuppressKeyup(event: KeyboardEvent) {
    if (event.key !== 'Alt') return;
    updateHintState({ isCurrentFunctionHintSuppressed: false });
  }

  function handleHintSuppressBlur() {
    updateHintState({ isCurrentFunctionHintSuppressed: false });
  }

  function syncSelectionState() {
    hasSelectedCode = !editorInstance?.getSelection()?.isEmpty();
  }

  function handleWindowKeydown(event: KeyboardEvent) {
    const isReferenceOverlayOpen = referenceState.kind !== null;
    if (shouldCloseScriptReferenceOverlay(event, isReferenceOverlayOpen)) {
      event.preventDefault();
      event.stopPropagation();
      closeReferenceOverlay();
      editorInstance?.focus();
      return;
    }

    const handbookShortcut = resolveScriptReferenceShortcut(
      event,
      Boolean(editorInstance?.hasTextFocus()),
      isReferenceOverlayOpen,
    );
    if (handbookShortcut) {
      event.preventDefault();
      event.stopPropagation();
      if (referenceState.kind === handbookShortcut) {
        closeReferenceOverlay();
        editorInstance?.focus();
      } else {
        void openReferenceOverlay(handbookShortcut);
      }
      return;
    }

    handleHintSuppressKeydown(event);
  }

  function handleWindowKeyup(event: KeyboardEvent) {
    if (referenceState.kind) return;
    handleHintSuppressKeyup(event);
  }

  function getHintAnchor(position: { lineNumber: number; column: number } | null | undefined) {
    if (!editorInstance || !editorHost || !position) {
      return { top: 12, placement: 'top' as const };
    }

    const visiblePosition = editorInstance.getScrolledVisiblePosition(position);
    return resolveHintAnchor(visiblePosition
      ? {
          hostOffsetTop: editorHost.offsetTop,
          visibleTop: visiblePosition.top,
          visibleHeight: visiblePosition.height,
        }
      : null);
  }

  function syncCallHighlights() {
    if (!editorInstance) return;

    const model = editorInstance.getModel();
    if (!model) {
      callHighlightDecorations?.clear();
      lastHighlightSource = '';
      lastHighlightDecorations = [];
      return;
    }

    const source = model.getValue();
    const nextHighlights = buildCallHighlightDecorations(
      source,
      lastHighlightSource,
      lastHighlightDecorations,
      collectLuaInlineHighlights,
    );
    lastHighlightSource = nextHighlights.source;
    lastHighlightDecorations = nextHighlights.decorations;

    callHighlightDecorations ??= editorInstance.createDecorationsCollection();
    callHighlightDecorations.set(nextHighlights.decorations);
  }

  function scheduleModelValidation() {
    if (!editorInstance || !monacoModule) return;

    clearTimeout(validateTimer ?? undefined);
    validateTimer = setTimeout(() => {
      const model = editorInstance?.getModel();
      if (!model || !monacoModule) return;
      monacoModule.validateLuaModel(model);
      syncCallHighlights();
    }, 80);
  }

  function syncSuggestHintPlacement() {
    if (!editorInstance) return;

    const position = editorInstance.getPosition();
    const anchor = getHintAnchor(position);
    updateHintState({
      suggestHintAnchorTop: anchor.top,
      suggestHintPlacement: anchor.placement,
    });
  }

  function syncHoverPlacement(position: { lineNumber: number; column: number } | null | undefined) {
    if (!editorInstance || !position) return;

    const visiblePosition = editorInstance.getScrolledVisiblePosition(position);
    const nextHoverAbove = resolveHoverAbove({
      visibleTop: visiblePosition?.top,
      visibleHeight: visiblePosition?.height,
      previous: hoverAbove,
    });
    if (nextHoverAbove === hoverAbove) return;

    hoverAbove = nextHoverAbove;
    editorInstance.updateOptions({
      hover: {
        above: hoverAbove,
      },
    });
  }

  function syncSuggestHint() {
    if (!monacoModule || !editorHost) return;

    const suggestWidget = editorHost.querySelector('.suggest-widget');
    const isSuggestVisible = suggestWidget instanceof HTMLElement
      && suggestWidget.offsetParent !== null
      && suggestWidget.querySelector('.monaco-list-row.focused');

    if (!isSuggestVisible) {
      clearSuggestHint();
      return false;
    }

    const label = extractFocusedSuggestLabel(editorHost);
    const description = label ? monacoModule.lookupCompletionDescription(label) : null;
    updateHintState({
      suggestHintText: description ?? '',
    });
    if (description) {
      syncSuggestHintPlacement();
    }

    return Boolean(description);
  }

  function ensureSuggestHintPolling() {
    if (suggestHintTimer) return;
    suggestHintTimer = setTimeout(function pollSuggestHint() {
      suggestHintTimer = null;
      const hasSuggestHint = syncSuggestHint();
      if (hasSuggestHint) {
        ensureSuggestHintPolling();
      } else {
        clearSuggestHint();
      }
    }, 120);
  }

  function refreshSuggestHint() {
    const hasSuggestHint = syncSuggestHint();
    if (hasSuggestHint) {
      ensureSuggestHintPolling();
    } else if (suggestHintTimer) {
      clearSuggestHint();
    }
  }

  function refreshCurrentFunctionHint() {
    if (!monacoModule || !editorInstance) {
      clearCurrentFunctionHint();
      return;
    }

    const model = editorInstance.getModel();
    const position = editorInstance.getPosition();
    if (!model || !position) {
      clearCurrentFunctionHint();
      return;
    }

    const hint = monacoModule.getCurrentFunctionHint(model, position);
    const anchor = getHintAnchor(position);
    updateHintState({
      currentFunctionHintTitle: hint?.title ?? '',
      currentFunctionHintDescription: hint?.description ?? '',
      currentFunctionHintAnchorTop: anchor.top,
      currentFunctionHintPlacement: anchor.placement,
    });
  }

  onMount(async () => {
    if (!editorHost) return;

    let destroyed = false;
    onDestroy(() => { destroyed = true; });

    const runtime = await createScriptMonacoRuntime({
      host: editorHost,
      onDidChangeModelContent: () => {
        if (isApplyingModel || !currentBoundTabId) return;
        const model = editorInstance?.getModel();
        if (!model || !monacoModule) return;

        updateScriptTabContent(currentBoundTabId, model.getValue());
        scheduleModelValidation();
        refreshSuggestHint();
        refreshCurrentFunctionHint();
      },
      onDidChangeCursorPosition: () => {
        refreshSuggestHint();
        refreshCurrentFunctionHint();
      },
      onDidChangeCursorSelection: () => {
        syncSelectionState();
      },
      onKeyUp: () => {
        refreshSuggestHint();
        refreshCurrentFunctionHint();
      },
      onMouseMove: (position) => {
        syncHoverPlacement(position);
      },
      onDidBlurEditorText: () => {
        clearSuggestHint();
        handleHintSuppressBlur();
      },
      onDidScrollChange: () => {
        refreshSuggestHint();
        refreshCurrentFunctionHint();
      },
      onWindowKeydown: handleWindowKeydown,
      onWindowKeyup: handleWindowKeyup,
      onWindowBlur: handleHintSuppressBlur,
    });

    // 组件在 Monaco 异步加载期间已被销毁，立即释放 runtime 并返回
    if (destroyed) {
      runtime.dispose();
      return;
    }

    monacoRuntime = runtime;
    monacoModule = monacoRuntime.module;
    monacoApi = monacoRuntime.api;
    editorInstance = monacoRuntime.editor;
    callHighlightDecorations = monacoRuntime.callHighlightDecorations;
    syncSelectionState();
    isMonacoReady = true;
    await loadCardContext();
    await syncEditorWithActiveTab();
  });

  onDestroy(() => {
    clearSuggestHint();
    clearCurrentFunctionHint();
    if (editorInstance && currentBoundTabId) {
      setScriptTabViewState(currentBoundTabId, editorInstance.saveViewState());
    }
    callHighlightDecorations?.clear();
    callHighlightDecorations = null;
    clearTimeout(validateTimer ?? undefined);
    validateTimer = null;
    monacoRuntime?.dispose();
    monacoRuntime = null;
  });

  $effect(() => {
    const contextKey = buildScriptEditorContextKey({
      activeScriptTab: $activeScriptTab,
      dbTabs: $tabs,
    });

    if (!isMonacoReady) return;
    if (contextKey === lastContextKey) return;
    lastContextKey = contextKey;

    void (async () => {
      await loadCardContext();
      await syncEditorWithActiveTab();
    })();
  });

  $effect(() => {
    if (!isMonacoReady || !monacoModule || !editorInstance) return;
    const model = editorInstance.getModel();
    if (!model) return;

    monacoModule.setModelContext(model, {
      cardCode: $activeScriptTab?.cardCode ?? 0,
      cardName: $activeScriptTab?.cardName ?? '',
      strings: scriptStrings,
      card: cardContext,
    });
    scheduleModelValidation();
    refreshSuggestHint();
    refreshCurrentFunctionHint();
  });
</script>

<div class="script-editor-shell">
  {@render children?.()}
  <div class="script-editor" bind:this={editorHost}></div>
</div>

<style>
  .script-editor-shell {
    min-width: 0;
    min-height: 0;
    padding: 6px 6px 6px 8px;
    position: relative;
  }

  .script-editor {
    height: 100%;
    min-height: 0;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 8px 18px rgba(15, 23, 42, 0.1);
    background: #121714;
  }

  .script-editor :global(.monaco-editor),
  .script-editor :global(.monaco-editor-background),
  .script-editor :global(.monaco-editor .margin),
  .script-editor :global(.monaco-editor .monaco-editor-background) {
    background:
      repeating-linear-gradient(
        to bottom,
        rgba(0, 0, 0, 0) 0,
        rgba(0, 0, 0, 0) 21px,
        rgba(186, 227, 198, 0.08) 21px,
        rgba(186, 227, 198, 0.08) 22px
      ),
      #121714 !important;
  }

  .script-editor :global(.monaco-editor) {
    --vscode-editor-selectionBackground: rgba(87, 166, 121, 0.28) !important;
    --vscode-editor-inactiveSelectionBackground: rgba(87, 166, 121, 0.18) !important;
    --vscode-editor-lineHighlightBackground: rgba(118, 184, 151, 0.12) !important;
    --vscode-editorError-background: rgba(196, 122, 112, 0.12) !important;
    --vscode-editorError-border: rgba(196, 122, 112, 0.28) !important;
    --vscode-editorWarning-background: rgba(196, 168, 102, 0.1) !important;
    --vscode-editorWarning-border: rgba(196, 168, 102, 0.22) !important;
    --vscode-editorInfo-background: rgba(113, 162, 181, 0.08) !important;
    --vscode-editorInfo-border: rgba(113, 162, 181, 0.2) !important;
  }

  .script-editor :global(.monaco-editor .focused .selected-text),
  .script-editor :global(.monaco-editor .selected-text) {
    background-color: rgba(87, 166, 121, 0.28) !important;
  }

  .script-editor :global(.monaco-editor .view-line .lua-call-highlight) {
    color: #8ec5ff !important;
    font-weight: 600;
  }

  .script-editor :global(.monaco-editor .view-line .lua-call-arg-highlight) {
    color: #c792ff !important;
    font-weight: 600;
  }

  .script-editor :global(.monaco-editor .view-line .lua-parameter-highlight) {
    color: #d8b4fe !important;
    font-weight: 600;
  }

  .script-editor :global(.monaco-editor .view-line .lua-constant-highlight) {
    color: #5eead4 !important;
    font-weight: 600;
  }

  .script-editor :global(.monaco-editor .view-overlays .current-line),
  .script-editor :global(.monaco-editor .margin-view-overlays .current-line) {
    background-color: rgba(118, 184, 151, 0.12) !important;
    border: none !important;
  }

  .script-editor :global(.monaco-editor .squiggly-error:before) {
    background: rgba(196, 122, 112, 0.12) !important;
  }

  .script-editor :global(.monaco-editor .squiggly-warning:before) {
    background: rgba(196, 168, 102, 0.1) !important;
  }

  .script-editor :global(.monaco-editor .squiggly-info:before) {
    background: rgba(113, 162, 181, 0.08) !important;
  }

  .script-editor :global(.monaco-editor .squiggly-error) {
    border-bottom: 2px solid rgba(196, 122, 112, 0.34) !important;
  }

  .script-editor :global(.monaco-editor .squiggly-warning) {
    border-bottom: 2px solid rgba(196, 168, 102, 0.28) !important;
  }

  .script-editor :global(.monaco-editor .squiggly-info) {
    border-bottom: 2px solid rgba(113, 162, 181, 0.24) !important;
  }

  .script-editor :global(.suggest-widget .monaco-list-row.focused) {
    background: #50675b !important;
    color: #f2fbf5 !important;
  }

  .script-editor :global(.suggest-widget .monaco-list-row.focused .label-name),
  .script-editor :global(.suggest-widget .monaco-list-row.focused .details-label),
  .script-editor :global(.suggest-widget .monaco-list-row.focused .monaco-icon-label),
  .script-editor :global(.suggest-widget .monaco-list-row.focused .suggest-icon) {
    color: inherit !important;
  }

  .script-editor :global(.suggest-widget .monaco-list-row:hover) {
    background: rgba(80, 103, 91, 0.24) !important;
    color: #eef7f1 !important;
  }

  .script-editor :global(.suggest-widget .monaco-list-row:hover .label-name),
  .script-editor :global(.suggest-widget .monaco-list-row:hover .details-label),
  .script-editor :global(.suggest-widget .monaco-list-row:hover .monaco-icon-label),
  .script-editor :global(.suggest-widget .monaco-list-row:hover .suggest-icon) {
    color: inherit !important;
  }

  :global([data-theme='light']) .script-editor {
    background: #f1f5ec;
  }

  :global([data-theme='light']) .script-editor :global(.monaco-editor),
  :global([data-theme='light']) .script-editor :global(.monaco-editor-background),
  :global([data-theme='light']) .script-editor :global(.monaco-editor .margin),
  :global([data-theme='light']) .script-editor :global(.monaco-editor .monaco-editor-background) {
    background:
      repeating-linear-gradient(
        to bottom,
        rgba(0, 0, 0, 0) 0,
        rgba(0, 0, 0, 0) 21px,
        rgba(104, 145, 112, 0.1) 21px,
        rgba(104, 145, 112, 0.1) 22px
      ),
      #f1f5ec !important;
  }

  :global([data-theme='light']) .script-editor :global(.monaco-editor) {
    --vscode-editor-selectionBackground: rgba(97, 141, 106, 0.22) !important;
    --vscode-editor-inactiveSelectionBackground: rgba(97, 141, 106, 0.14) !important;
    --vscode-editor-lineHighlightBackground: rgba(74, 133, 91, 0.1) !important;
    --vscode-editorError-background: rgba(198, 128, 117, 0.08) !important;
    --vscode-editorError-border: rgba(198, 128, 117, 0.2) !important;
    --vscode-editorWarning-background: rgba(189, 155, 86, 0.08) !important;
    --vscode-editorWarning-border: rgba(189, 155, 86, 0.2) !important;
    --vscode-editorInfo-background: rgba(94, 144, 166, 0.06) !important;
    --vscode-editorInfo-border: rgba(94, 144, 166, 0.16) !important;
  }

  :global([data-theme='light']) .script-editor :global(.monaco-editor .view-line .lua-call-highlight) {
    color: #1d5fd1 !important;
    font-weight: 600;
  }

  :global([data-theme='light']) .script-editor :global(.monaco-editor .view-line .lua-call-arg-highlight) {
    color: #7c3aed !important;
    font-weight: 600;
  }

  :global([data-theme='light']) .script-editor :global(.monaco-editor .view-line .lua-parameter-highlight) {
    color: #8b5cf6 !important;
    font-weight: 600;
  }

  :global([data-theme='light']) .script-editor :global(.monaco-editor .view-line .lua-constant-highlight) {
    color: #0f766e !important;
    font-weight: 600;
  }

  :global([data-theme='light']) .script-editor :global(.suggest-widget .monaco-list-row.focused) {
    background: #dbe8dc !important;
    color: #16311e !important;
  }

  :global([data-theme='light']) .script-editor :global(.suggest-widget .monaco-list-row:hover) {
    background: rgba(219, 232, 220, 0.42) !important;
    color: #16311e !important;
  }
</style>
