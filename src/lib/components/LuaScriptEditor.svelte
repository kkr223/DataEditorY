<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { _ } from 'svelte-i18n';
  import { activeScriptTab, getActiveScriptTab, setScriptTabViewState, updateScriptTabContent } from '$lib/stores/scriptEditor.svelte';
  import { activeTabId, tabs } from '$lib/stores/db';
  import { isCapabilityEnabled } from '$lib/application/capabilities/registry';
  import { collectLuaCallHighlights } from '$lib/utils/luaScriptCalls';
  import type { CardDataEntry } from '$lib/types';
  import type { AgentStage } from '$lib/utils/ai';
  import type { editor as MonacoEditor } from 'monaco-editor';
  import { normalizeCardStrings } from '$lib/domain/card/draft';
  import { buildScriptFileName } from '$lib/domain/script/workspace';
  import { getScriptGenerationStageLabel } from '$lib/services/scriptGeneration';
  import {
    buildCallHighlightDecorations,
    buildScriptEditorContextKey,
    extractFocusedSuggestLabel,
    resolveHintAnchor,
    resolveHoverAbove,
    resolveScriptReferenceShortcut,
    shouldHandleHintSuppressShortcut,
    shouldCloseScriptReferenceOverlay,
    type ScriptReferenceManualKind,
  } from '$lib/features/script-editor/controller';
  import {
    ATTRIBUTE_OPTIONS,
    getCardTypeKey,
    getPackedLScale,
    getPackedLevel,
    getPackedRScale,
    LINK_MARKERS,
    RACE_OPTIONS,
    TYPE_BITS,
  } from '$lib/utils/card';
  import {
    copyScriptImageFlow,
    exportScriptImageFlow,
    generateScriptFromEditorFlow,
    loadScriptCardContextFlow,
    openScriptExternallyFlow,
    reloadScriptEditorFlow,
    saveScriptEditorFlow,
    saveScriptStringFlow,
  } from '$lib/features/script-editor/useCases';
  import {
    createScriptMonacoRuntime,
    type ScriptMonacoApi as MonacoApi,
    type ScriptMonacoModule as MonacoModule,
    type ScriptMonacoRuntime,
  } from '$lib/features/script-editor/runtime';
  import ScriptToolbar from '$lib/features/script-editor/components/ScriptToolbar.svelte';
  import ScriptHintOverlays from '$lib/features/script-editor/components/ScriptHintOverlays.svelte';
  import ScriptReferenceOverlay from '$lib/features/script-editor/components/ScriptReferenceOverlay.svelte';
  import ScriptSidePanel from '$lib/features/script-editor/components/ScriptSidePanel.svelte';
  import ScriptEmptyState from '$lib/features/script-editor/components/ScriptEmptyState.svelte';
  import type { LuaReferenceManualItem } from '$lib/utils/luaScriptMonaco';
  const hasAiCapability = isCapabilityEnabled('ai');

  let editorHost = $state<HTMLDivElement | null>(null);
  let monacoModule = $state<MonacoModule | null>(null);
  let monacoApi = $state<MonacoApi | null>(null);
  let editorInstance = $state<MonacoEditor.IStandaloneCodeEditor | null>(null);
  let callHighlightDecorations = $state<MonacoEditor.IEditorDecorationsCollection | null>(null);
  let monacoRuntime = $state<ScriptMonacoRuntime | null>(null);
  let currentBoundTabId = $state<string | null>(null);
  let isApplyingModel = false;
  let cardContext = $state<CardDataEntry | null>(null);
  let isReloading = $state(false);
  let isSaving = $state(false);
  let isExportingImage = $state(false);
  let isCopyingImage = $state(false);
  let isGeneratingScript = $state(false);
  let isMonacoReady = $state(false);
  let loadContextToken = 0;
  let lastContextKey = $state('');
  let savedScriptStrings = $state<string[]>(Array.from({ length: 16 }, () => ''));
  let scriptGenerationStage = $state<AgentStage | ''>('');
  let scriptGenerationAbortController = $state<AbortController | null>(null);
  let suggestHintText = $state('');
  let suggestHintPlacement = $state<'top' | 'bottom'>('top');
  let suggestHintAnchorTop = $state(12);
  let currentFunctionHintTitle = $state('');
  let currentFunctionHintDescription = $state('');
  let isCurrentFunctionHintSuppressed = $state(false);
  let currentFunctionHintPlacement = $state<'top' | 'bottom'>('top');
  let currentFunctionHintAnchorTop = $state(12);
  let referenceOverlayKind = $state<ScriptReferenceManualKind | null>(null);
  let referenceManualItems = $state<Record<ScriptReferenceManualKind, LuaReferenceManualItem[]>>({
    constants: [],
    functions: [],
  });
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

  let scriptStrings = $derived.by(() => {
    const values = Array.from({ length: 16 }, (_, index) => cardContext?.strings[index] ?? '');
    return values;
  });

  function getScriptTabTitle() {
    const tab = $activeScriptTab;
    if (!tab) return '';
    return buildScriptFileName(tab.cardCode);
  }

  function getCardMetaLines(card: CardDataEntry | null, fallbackCode: number) {
    if (!card) {
      return [`ID: ${fallbackCode}`];
    }

    const typeText = TYPE_BITS
      .filter((item) => (card.type & item.bit) !== 0)
      .map((item) => $_(item.key))
      .join(' / ') || $_('search.na');
    const attributeText = ATTRIBUTE_OPTIONS.find((item) => item.value === card.attribute)?.key
      ? $_(ATTRIBUTE_OPTIONS.find((item) => item.value === card.attribute)?.key as string)
      : $_('search.na');
    const raceText = RACE_OPTIONS.find((item) => item.value === card.race)?.key
      ? $_(RACE_OPTIONS.find((item) => item.value === card.race)?.key as string)
      : $_('search.na');
    const mainType = $_(getCardTypeKey(card.type));
    const levelValue = getPackedLevel(card.level);
    const leftScale = getPackedLScale(card.level);
    const rightScale = getPackedRScale(card.level);
    const isLink = (card.type & 0x4000000) !== 0;
    const isPendulum = leftScale > 0 || rightScale > 0;
    const statsLine = isLink
      ? `ATK ${card.attack}  LINK ${levelValue || 0}`
      : `ATK ${card.attack}  DEF ${card.defense}  ${mainType === $_('search.types.monster') ? `LV ${levelValue || 0}` : mainType}`;
    const extras = [];
    if (isPendulum) {
      extras.push(`Scale ${leftScale}/${rightScale}`);
    }
    if (isLink) {
      const markers = LINK_MARKERS.filter((item) => (card.linkMarker & item.bit) !== 0).map((item) => item.label).join(' ');
      if (markers) {
        extras.push(`Link ${markers}`);
      }
    }

    return [
      `ID: ${card.code}`,
      `Type: ${typeText}`,
      `Attribute / Race: ${attributeText} / ${raceText}`,
      extras.length > 0 ? `${statsLine}  ${extras.join('  ')}` : statsLine,
    ];
  }

  function getScriptImageRenderInfo() {
    return {
      title: cardContext?.name?.trim() || getScriptTabTitle(),
      metaLines: getCardMetaLines(cardContext, $activeScriptTab?.cardCode ?? 0),
      effectTitle: $_('editor.desc'),
      effectText: cardContext?.desc?.trim() || $_('editor.script_effect_empty'),
    };
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

  async function handleStringBlur(index: number) {
    const result = await saveScriptStringFlow({
      tab: getActiveScriptTab(),
      cardContext,
      savedScriptStrings,
      index,
      dbTabs: $tabs,
      activeDbTabId: $activeTabId,
      t: (key, options) => $_(key, options as never),
    });
    if (!result) return;
    cardContext = result.cardContext;
    savedScriptStrings = result.savedScriptStrings;
  }

  function handleStringInput(index: number, value: string) {
    if (!cardContext) return;
    const nextStrings = normalizeCardStrings(cardContext.strings);
    nextStrings[index] = value;
    cardContext = {
      ...cardContext,
      strings: nextStrings,
    };
  }

  function handleInsertStringId(index: number) {
    if (!editorInstance || !monacoModule) return;
    const inserted = monacoModule.insertSnippet(editorInstance, `aux.Stringid(id,${index})`);
    if (inserted) {
      editorInstance.focus();
      refreshCurrentFunctionHint();
      refreshSuggestHint();
    }
  }

  function openReferenceOverlay(kind: ScriptReferenceManualKind) {
    referenceSelection = editorInstance?.getSelection() ?? null;
    referenceOverlayKind = kind;
  }

  function closeReferenceOverlay() {
    referenceOverlayKind = null;
  }

  function handleInsertReferenceItem(item: LuaReferenceManualItem) {
    if (!editorInstance || !monacoModule) return;

    if (referenceSelection) {
      editorInstance.setSelection(referenceSelection);
    }
    editorInstance.focus();

    const inserted = monacoModule.insertSnippet(editorInstance, item.insertText);
    if (!inserted) return;

    referenceSelection = editorInstance.getSelection() ?? null;
    closeReferenceOverlay();
    refreshCurrentFunctionHint();
    refreshSuggestHint();
  }

  async function syncEditorWithActiveTab() {
    if (!editorInstance || !monacoModule || !monacoApi) return;

    const tab = getActiveScriptTab();
    if (!tab) {
      currentBoundTabId = null;
      closeReferenceOverlay();
      editorInstance.setModel(null);
      return;
    }

    if (currentBoundTabId && currentBoundTabId !== tab.id) {
      setScriptTabViewState(currentBoundTabId, editorInstance.saveViewState());
    }

    const uri = monacoModule.createScriptModelUri(tab.id);
    let model = monacoApi.editor.getModel(uri);
    const currentModel = editorInstance.getModel();
    const isSwitchingTab =
      currentBoundTabId !== tab.id || currentModel?.uri.toString() !== uri.toString();

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
  }

  function clearSuggestHint() {
    suggestHintText = '';
    suggestHintPlacement = 'top';
    suggestHintAnchorTop = 12;
    if (suggestHintTimer) {
      clearTimeout(suggestHintTimer);
      suggestHintTimer = null;
    }
  }

  function clearCurrentFunctionHint() {
    currentFunctionHintTitle = '';
    currentFunctionHintDescription = '';
    isCurrentFunctionHintSuppressed = false;
    currentFunctionHintPlacement = 'top';
    currentFunctionHintAnchorTop = 12;
  }

  function handleHintSuppressKeydown(event: KeyboardEvent) {
    if (!shouldHandleHintSuppressShortcut(event, Boolean(editorInstance?.hasTextFocus()))) return;
    isCurrentFunctionHintSuppressed = true;
  }

  function handleHintSuppressKeyup(event: KeyboardEvent) {
    if (event.key !== 'Alt') return;
    isCurrentFunctionHintSuppressed = false;
  }

  function handleHintSuppressBlur() {
    isCurrentFunctionHintSuppressed = false;
  }

  function handleWindowKeydown(event: KeyboardEvent) {
    const isReferenceOverlayOpen = referenceOverlayKind !== null;
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
      if (referenceOverlayKind === handbookShortcut) {
        closeReferenceOverlay();
        editorInstance?.focus();
      } else {
        openReferenceOverlay(handbookShortcut);
      }
      return;
    }

    handleHintSuppressKeydown(event);
  }

  function handleWindowKeyup(event: KeyboardEvent) {
    if (referenceOverlayKind) return;
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
      collectLuaCallHighlights,
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
    suggestHintAnchorTop = anchor.top;
    suggestHintPlacement = anchor.placement;
  }

  function syncHoverPlacement(
    position: { lineNumber: number; column: number } | null | undefined,
  ) {
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
      return;
    }

    const label = extractFocusedSuggestLabel(editorHost);
    const description = label ? monacoModule.lookupCompletionDescription(label) : null;
    suggestHintText = description ?? '';
    if (suggestHintText) {
      syncSuggestHintPlacement();
    }
  }

  function ensureSuggestHintPolling() {
    if (suggestHintTimer) return;
    suggestHintTimer = setTimeout(function pollSuggestHint() {
      suggestHintTimer = null;
      syncSuggestHint();
      if (suggestHintText) {
        ensureSuggestHintPolling();
      } else {
        clearSuggestHint();
      }
    }, 120);
  }

  function refreshSuggestHint() {
    syncSuggestHint();
    if (suggestHintText) {
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
    currentFunctionHintTitle = hint?.title ?? '';
    currentFunctionHintDescription = hint?.description ?? '';
    const anchor = getHintAnchor(position);
    currentFunctionHintAnchorTop = anchor.top;
    currentFunctionHintPlacement = anchor.placement;
  }

  async function handleSave() {
    const tab = getActiveScriptTab();
    if (!tab || isSaving) return;

    isSaving = true;
    try {
      await saveScriptEditorFlow({
        tab,
        isSaving: false,
        t: (key, options) => $_(key, options as never),
      });
    } finally {
      isSaving = false;
    }
  }

  async function handleGenerateScript() {
    await generateScriptFromEditorFlow({
      tab: getActiveScriptTab(),
      isGeneratingScript,
      cardContext,
      dbTabs: $tabs,
      t: (key, options) => $_(key, options as never),
      setIsGeneratingScript: (value) => {
        isGeneratingScript = value;
      },
      setScriptGenerationStage: (value) => {
        scriptGenerationStage = value;
      },
      setAbortController: (value) => {
        scriptGenerationAbortController = value;
      },
    });
  }

  function handleCancelGenerateScript() {
    scriptGenerationAbortController?.abort();
  }

  async function handleReload() {
    const tab = getActiveScriptTab();
    if (!tab || isReloading) return;

    isReloading = true;
    try {
      const ok = await reloadScriptEditorFlow({
        tab,
        isReloading: false,
        t: (key, options) => $_(key, options as never),
      });
      if (ok) {
        await loadCardContext();
        await syncEditorWithActiveTab();
      }
    } finally {
      isReloading = false;
    }
  }

  async function handleOpenExternal() {
    await openScriptExternallyFlow({
      tab: getActiveScriptTab(),
      t: (key, options) => $_(key, options as never),
    });
  }

  async function handleExportImage() {
    const tab = getActiveScriptTab();
    if (!tab || !monacoModule || isExportingImage) return;

    isExportingImage = true;
    try {
      await exportScriptImageFlow({
        tab,
        monacoModule,
        isExporting: false,
        renderInfo: getScriptImageRenderInfo(),
        t: (key, options) => $_(key, options as never),
      });
    } finally {
      isExportingImage = false;
    }
  }

  async function handleCopyImage() {
    const tab = getActiveScriptTab();
    if (!tab || !monacoModule || isCopyingImage) return;

    isCopyingImage = true;
    try {
      await copyScriptImageFlow({
        tab,
        monacoModule,
        isCopying: false,
        renderInfo: getScriptImageRenderInfo(),
        t: (key, options) => $_(key, options as never),
      });
    } finally {
      isCopyingImage = false;
    }
  }

  onMount(async () => {
    if (!editorHost) return;

    monacoRuntime = await createScriptMonacoRuntime({
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
    monacoModule = monacoRuntime.module;
    monacoApi = monacoRuntime.api;
    editorInstance = monacoRuntime.editor;
    callHighlightDecorations = monacoRuntime.callHighlightDecorations;
    referenceManualItems = {
      constants: monacoRuntime.module.getReferenceManualItems('constants'),
      functions: monacoRuntime.module.getReferenceManualItems('functions'),
    };

    isMonacoReady = true;
    await loadCardContext();
    await syncEditorWithActiveTab();
  });

  onDestroy(() => {
    scriptGenerationAbortController?.abort();
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

{#if $activeScriptTab}
  <section class="script-page">
    <ScriptToolbar
      title={getScriptTabTitle()}
      cardCodeLabel={$_('editor.script_workspace_card', { values: { code: String($activeScriptTab.cardCode) } })}
      cardName={cardContext?.name || $activeScriptTab.cardName || '-'}
      cdbPath={$activeScriptTab.cdbPath}
      hasAiCapability={hasAiCapability}
      isGeneratingScript={isGeneratingScript}
      isReloading={isReloading}
      isSaving={isSaving}
      stageLabel={getScriptGenerationStageLabel(scriptGenerationStage)}
      generateLabel={$_('editor.script_generate_button')}
      generatingLabel={$_('editor.script_generating')}
      cancelLabel={$_('editor.script_cancel_button')}
      reloadLabel={$_('editor.script_reload')}
      reloadingLabel={$_('editor.script_reloading')}
      openExternalLabel={$_('editor.script_open_external')}
      exportImageLabel={$_('editor.script_export_image')}
      copyImageLabel={$_('editor.script_copy_image')}
      saveLabel={$_('editor.script_save')}
      isExportingImage={isExportingImage}
      isCopyingImage={isCopyingImage}
      exportingImageLabel={$_('editor.script_exporting_image')}
      copyingImageLabel={$_('editor.script_copying_image')}
      savingLabel={$_('editor.script_saving')}
      onGenerate={handleGenerateScript}
      onCancelGenerate={handleCancelGenerateScript}
      onReload={handleReload}
      onOpenExternal={handleOpenExternal}
      onExportImage={handleExportImage}
      onCopyImage={handleCopyImage}
      onSave={handleSave}
    />

    <div class="script-layout">
      <div class="script-editor-shell">
        <ScriptHintOverlays
          currentFunctionHintTitle={currentFunctionHintTitle}
          currentFunctionHintDescription={currentFunctionHintDescription}
          isCurrentFunctionHintSuppressed={isCurrentFunctionHintSuppressed}
          currentFunctionHintPlacement={currentFunctionHintPlacement}
          currentFunctionHintAnchorTop={currentFunctionHintAnchorTop}
          suggestHintText={suggestHintText}
          suggestHintPlacement={suggestHintPlacement}
          suggestHintAnchorTop={suggestHintAnchorTop}
        />
        <ScriptReferenceOverlay
          open={referenceOverlayKind !== null}
          kind={referenceOverlayKind ?? 'constants'}
          title={referenceOverlayKind === 'constants'
            ? $_('editor.script_reference_constants_title')
            : $_('editor.script_reference_functions_title')}
          shortcutHint={referenceOverlayKind === 'constants'
            ? $_('editor.script_reference_constants_shortcut')
            : $_('editor.script_reference_functions_shortcut')}
          searchPlaceholder={$_('editor.script_reference_search_placeholder')}
          emptyText={$_('editor.script_reference_empty')}
          closeLabel={$_('editor.script_reference_close')}
          items={referenceOverlayKind ? referenceManualItems[referenceOverlayKind] : []}
          onClose={closeReferenceOverlay}
          onInsert={handleInsertReferenceItem}
        />
        <div class="script-editor" bind:this={editorHost}></div>
      </div>

      <ScriptSidePanel
        descriptionTitle={$_('editor.desc')}
        stringsTitle={$_('editor.script_strings_title')}
        effectText={cardContext?.desc || ''}
        effectEmptyText={$_('editor.script_effect_empty')}
        stringPlaceholder={$_('editor.script_string_empty')}
        scriptStrings={scriptStrings}
        onInsertStringId={handleInsertStringId}
        onStringInput={handleStringInput}
        onStringBlur={handleStringBlur}
      />
    </div>
  </section>
{:else}
  <ScriptEmptyState
    title={$_('editor.script_empty_title')}
    description={$_('editor.script_empty_description')}
  />
{/if}

<style>
  .script-page {
    height: 100%;
    display: flex;
    flex-direction: column;
    background:
      radial-gradient(circle at top left, rgba(59, 130, 246, 0.12), transparent 26%),
      radial-gradient(circle at right top, rgba(16, 185, 129, 0.12), transparent 24%),
      var(--bg-base);
  }

  .script-layout {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 272px;
  }

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

  :global([data-theme='light']) .script-editor :global(.suggest-widget .monaco-list-row.focused) {
    background: #dbe8dc !important;
    color: #16311e !important;
  }

  :global([data-theme='light']) .script-editor :global(.suggest-widget .monaco-list-row:hover) {
    background: rgba(219, 232, 220, 0.42) !important;
    color: #16311e !important;
  }

  @media (max-width: 1180px) {
    .script-layout {
      grid-template-columns: 1fr;
      grid-template-rows: minmax(0, 1fr) auto;
    }
  }
</style>
