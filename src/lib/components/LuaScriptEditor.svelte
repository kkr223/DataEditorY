<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { activeTabId, tabs } from '$lib/stores/db';
  import { editorState, getSelectedCard } from '$lib/stores/editor.svelte';
  import {
    activeScriptTab,
  } from '$lib/stores/scriptEditor.svelte';
  import { isCapabilityEnabled } from '$lib/application/capabilities/registry';
  import type { CardDataEntry } from '$lib/types';
  import { buildScriptFileName } from '$lib/domain/script/workspace';
  import { getScriptGenerationStageLabel, type ScriptGenerationStage } from '$lib/services/scriptGenerationStages';
  import {
    openScriptExternallyFlow,
    reloadScriptEditorFlow,
    saveScriptEditorFlow,
    shareScriptImageFlow,
  } from '$lib/features/script-editor/useCases';
  import { buildScriptImageRenderInfo } from '$lib/features/script-editor/view';
  import ScriptEmptyState from '$lib/features/script-editor/components/ScriptEmptyState.svelte';
  import ScriptHintOverlays from '$lib/features/script-editor/components/ScriptHintOverlays.svelte';
  import ScriptReferenceOverlay from '$lib/features/script-editor/components/ScriptReferenceOverlay.svelte';
  import ScriptSidePanel from '$lib/features/script-editor/components/ScriptSidePanel.svelte';
  import ScriptToolbar from '$lib/features/script-editor/components/ScriptToolbar.svelte';
  import ScriptEditorCore, {
    type ScriptEditorCoreHintState,
    type ScriptEditorCoreReferenceState,
  } from '$lib/features/script-editor/components/ScriptEditorCore.svelte';

  type ScriptEditorExtraUseCasesModule = typeof import('$lib/features/script-editor/extraUseCases');
  type ScriptEditorCoreHandle = {
    getScriptImageSelection: () => import('$lib/features/script-editor/useCases').ScriptImageSelection | null;
    insertStringId: (index: number) => void;
    updateStringInput: (index: number, value: string) => void;
    persistString: (index: number) => Promise<void>;
    closeReferenceOverlay: () => void;
    insertReferenceItem: (item: import('$lib/utils/luaReferenceManual').LuaReferenceManualItem) => void;
  };

  const hasAiCapability = isCapabilityEnabled('ai');
  const loadScriptEditorExtraUseCases = __APP_FEATURES__.ai
    ? () => import('$lib/features/script-editor/extraUseCases')
    : null;

  let editorCore = $state<ScriptEditorCoreHandle | null>(null);
  let cardContext = $state<CardDataEntry | null>(null);
  let hasSelectedCode = $state(false);
  let isReloading = $state(false);
  let isSaving = $state(false);
  let isSharingImage = $state(false);
  let isGeneratingScript = $state(false);
  let scriptGenerationStage = $state<ScriptGenerationStage | ''>('');
  let scriptGenerationAbortController = $state<AbortController | null>(null);
  let scriptEditorExtraUseCasesPromise = $state<Promise<ScriptEditorExtraUseCasesModule> | null>(null);
  let hintState = $state<ScriptEditorCoreHintState>({
    suggestHintText: '',
    suggestHintPlacement: 'top',
    suggestHintAnchorTop: 12,
    currentFunctionHintTitle: '',
    currentFunctionHintDescription: '',
    isCurrentFunctionHintSuppressed: false,
    currentFunctionHintPlacement: 'top',
    currentFunctionHintAnchorTop: 12,
  });
  let referenceState = $state<ScriptEditorCoreReferenceState>({
    kind: null,
    isLoading: false,
    items: {
      constants: [],
      functions: [],
    },
  });

  const scriptStrings = $derived.by(() => Array.from({ length: 16 }, (_, index) => cardContext?.strings[index] ?? ''));
  const activeDbTab = $derived.by(() => $tabs.find((tab) => tab.id === $activeTabId) ?? null);
  const canOpenNewScriptTab = $derived(Boolean(activeDbTab && editorState.selectedId !== null));

  function ensureScriptEditorExtraUseCases() {
    if (!loadScriptEditorExtraUseCases || !hasAiCapability) {
      return null;
    }

    scriptEditorExtraUseCasesPromise ??= loadScriptEditorExtraUseCases();
    return scriptEditorExtraUseCasesPromise;
  }

  function getScriptTabTitle() {
    const tab = $activeScriptTab;
    if (!tab) return '';
    return buildScriptFileName(tab.cardCode);
  }

  async function handleOpenSelectedScript() {
    const dbTab = activeDbTab;
    const selectedCard = getSelectedCard();
    if (!dbTab || !selectedCard) {
      return;
    }

    const { openCardScriptWorkspace } = await import('$lib/services/cardScriptService');
    await openCardScriptWorkspace({
      cdbPath: dbTab.path,
      sourceTabId: dbTab.id,
      cardCode: selectedCard.code,
      cardName: selectedCard.name ?? '',
    });
  }

  async function handleSave() {
    const tab = $activeScriptTab;
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
    const extraModule = ensureScriptEditorExtraUseCases();
    if (!extraModule) return;

    await (await extraModule).generateScriptFromEditorFlow({
      tab: $activeScriptTab,
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
    const tab = $activeScriptTab;
    if (!tab || isReloading) return;

    isReloading = true;
    try {
      await reloadScriptEditorFlow({
        tab,
        isReloading: false,
        t: (key, options) => $_(key, options as never),
      });
    } finally {
      isReloading = false;
    }
  }

  async function handleOpenExternal() {
    await openScriptExternallyFlow({
      tab: $activeScriptTab,
      t: (key, options) => $_(key, options as never),
    });
  }

  async function handleShareImage() {
    const tab = $activeScriptTab;
    if (!tab || isSharingImage) return;

    isSharingImage = true;
    try {
      await shareScriptImageFlow({
        tab,
        isSharing: false,
        renderInfo: buildScriptImageRenderInfo({
          cardContext,
          fallbackCode: $activeScriptTab?.cardCode ?? 0,
          title: getScriptTabTitle(),
          t: $_,
        }),
        selection: editorCore?.getScriptImageSelection() ?? null,
        t: (key, options) => $_(key, options as never),
      });
    } finally {
      isSharingImage = false;
    }
  }
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
      stageLabel={getScriptGenerationStageLabel($_, scriptGenerationStage)}
      generateLabel={$_('editor.script_generate_button')}
      generatingLabel={$_('editor.script_generating')}
      cancelLabel={$_('editor.script_cancel_button')}
      reloadLabel={$_('editor.script_reload')}
      reloadingLabel={$_('editor.script_reloading')}
      openExternalLabel={$_('editor.script_open_external')}
      imageActionLabel={$_(hasSelectedCode ? 'editor.script_export_selected_image' : 'editor.script_export_image')}
      saveLabel={$_('editor.script_save')}
      isSharingImage={isSharingImage}
      sharingImageLabel={$_('editor.script_exporting_image')}
      savingLabel={$_('editor.script_saving')}
      onGenerate={handleGenerateScript}
      onCancelGenerate={handleCancelGenerateScript}
      onReload={handleReload}
      onOpenExternal={handleOpenExternal}
      onShareImage={handleShareImage}
      onSave={handleSave}
    />

    <div class="script-layout">
      <ScriptEditorCore
        bind:this={editorCore}
        bind:cardContext
        bind:hasSelectedCode
        bind:hintState
        bind:referenceState
      >
        <ScriptHintOverlays
          currentFunctionHintTitle={hintState.currentFunctionHintTitle}
          currentFunctionHintDescription={hintState.currentFunctionHintDescription}
          isCurrentFunctionHintSuppressed={hintState.isCurrentFunctionHintSuppressed}
          currentFunctionHintPlacement={hintState.currentFunctionHintPlacement}
          currentFunctionHintAnchorTop={hintState.currentFunctionHintAnchorTop}
          suggestHintText={hintState.suggestHintText}
          suggestHintPlacement={hintState.suggestHintPlacement}
          suggestHintAnchorTop={hintState.suggestHintAnchorTop}
        />

        <ScriptReferenceOverlay
          open={referenceState.kind !== null}
          kind={referenceState.kind ?? 'constants'}
          title={referenceState.kind === 'constants'
            ? $_('editor.script_reference_constants_title')
            : $_('editor.script_reference_functions_title')}
          shortcutHint={referenceState.kind === 'constants'
            ? $_('editor.script_reference_constants_shortcut')
            : $_('editor.script_reference_functions_shortcut')}
          searchPlaceholder={$_('editor.script_reference_search_placeholder')}
          emptyText={$_('editor.script_reference_empty')}
          loading={referenceState.isLoading}
          loadingText={$_('editor.script_reference_loading')}
          closeLabel={$_('editor.script_reference_close')}
          items={referenceState.kind ? referenceState.items[referenceState.kind] : []}
          onClose={() => editorCore?.closeReferenceOverlay()}
          onInsert={(item) => editorCore?.insertReferenceItem(item)}
        />
      </ScriptEditorCore>

      <ScriptSidePanel
        descriptionTitle={$_('editor.desc')}
        stringsTitle={$_('editor.script_strings_title')}
        effectText={cardContext?.desc || ''}
        effectEmptyText={$_('editor.script_effect_empty')}
        stringPlaceholder={$_('editor.script_string_empty')}
        scriptStrings={scriptStrings}
        onInsertStringId={(index) => editorCore?.insertStringId(index)}
        onStringInput={(index, value) => editorCore?.updateStringInput(index, value)}
        onStringBlur={(index) => editorCore?.persistString(index) ?? Promise.resolve()}
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
    min-height: 0;
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
    overflow: hidden;
  }
</style>
