<script lang="ts">
  import { tick } from 'svelte';
  import { _ } from 'svelte-i18n';
  import type { CardDataEntry } from '$lib/types';
  import type { CardWorkbenchContext } from '$lib/modules/card/workbench/context';
  import {
    createCardScriptGenerationController,
    createCardScriptGenerationState,
    createInitialParseManuscript,
    handleParseModalBackdropDismiss,
  } from '$lib/features/card-editor/controller';
  import {
    generateCardScriptFlow,
    openParseModalFlow,
    parseCardManuscriptFlow,
    runEditorInstructionFlow,
    saveParsedCardsIndividuallyFlow,
  } from '$lib/features/card-editor/extraUseCases';
  import { getScriptGenerationStageLabel } from '$lib/services/scriptGenerationStages';
  import CardParseDialog from '$lib/features/card-editor/components/CardParseDialog.svelte';

  let { context }: { context: CardWorkbenchContext } = $props();
  let modalOpen = $state(false);
  let mode = $state<'parse' | 'instruction'>('parse');
  let manuscript = $state('');
  let isRunning = $state(false);
  let resultText = $state('');
  const generation = $state(createCardScriptGenerationState());
  const generationController = createCardScriptGenerationController(generation);

  const saveParsedCards = (cards: CardDataEntry[]) => saveParsedCardsIndividuallyFlow({
    cards,
    t: context.t,
    loadCardIntoDraft: context.loadCardIntoDraft,
    handleSearch: context.handleSearch,
    refreshDraftImage: context.refreshDraftImage,
  });

  const openDialog = async () => {
    const opened = await openParseModalFlow({
      hasAiCapability: true,
      draftCard: context.draftCard,
      setManuscriptInput: (value) => { manuscript = value; },
      setParseModalOpen: (value) => { modalOpen = value; },
    });
    if (!opened) return;
    mode = 'parse';
    resultText = '';
  };

  const generateScript = () => generateCardScriptFlow({
    activeCdbPath: context.activeCdbPath,
    activeTabId: context.activeDocumentId,
    draftCard: context.draftCard,
    t: context.t,
    setIsGeneratingScript: generationController.setIsGenerating,
    setScriptGenerationStage: generationController.setStage,
    setScriptGenerationAbortController: generationController.setAbortController,
  });

  const confirm = async () => {
    if (mode === 'instruction') {
      await runEditorInstructionFlow({
        hasAiCapability: true,
        instruction: manuscript,
        activeCdbPath: context.activeCdbPath,
        currentCardCode: context.draftCard.code ?? null,
        currentCard: context.draftCard,
        t: context.t,
        setIsRunning: (value) => { isRunning = value; },
        refreshAfterExecution: async () => { await context.handleSearch(true); },
        setLastResult: (value) => { resultText = value; },
      });
      return;
    }

    await parseCardManuscriptFlow({
      hasAiCapability: true,
      manuscriptInput: manuscript,
      activeCdbPath: context.activeCdbPath,
      currentCardCode: context.draftCard.code ?? null,
      prepareForImport: async () => {
        if (!context.isEditingExisting) return;
        context.handleNewCard();
        await tick();
      },
      t: context.t,
      setIsParsingManuscript: (value) => { isRunning = value; },
      setParseModalOpen: (value) => { modalOpen = value; },
      setDraftCard: context.setDraftCard,
      syncSetcodesFromCard: context.syncSetcodesFromCard,
      afterDraftApplied: tick,
      handleModify: context.handleModify,
      saveParsedCardsIndividually: saveParsedCards,
    });
  };

  const changeMode = (next: 'parse' | 'instruction') => {
    mode = next;
    if (next !== 'instruction') return;
    resultText = '';
    if (manuscript.trim() === createInitialParseManuscript(context.draftCard)) {
      manuscript = '';
    }
  };
</script>

<button class="btn-secondary btn-sm" type="button" onclick={openDialog}>
  {$_('editor.ai_parse_button')}
</button>

<div class="generation-group">
  <button
    class="btn-secondary btn-sm"
    type="button"
    onclick={generateScript}
    disabled={generation.isGenerating}
  >
    {generation.isGenerating ? $_('editor.script_generating') : $_('editor.script_generate_button')}
  </button>
  {#if generation.isGenerating}
    <button
      class="btn-secondary btn-sm"
      type="button"
      onclick={generationController.cancel}
    >
      {$_('editor.script_cancel_button')}
    </button>
    <span>{getScriptGenerationStageLabel($_, generation.stage)}</span>
  {/if}
</div>

<CardParseDialog
  open={modalOpen}
  {mode}
  manuscriptInput={manuscript}
  isParsing={isRunning}
  onModeChange={changeMode}
  onClose={() => { if (!isRunning) modalOpen = false; }}
  onConfirm={confirm}
  onBackdropKeydown={(event) => handleParseModalBackdropDismiss(
    event,
    () => { if (!isRunning) modalOpen = false; },
  )}
  closeAriaLabel={$_('editor.card_image_crop_cancel')}
  dialogAriaLabel={$_('editor.ai_interaction_title')}
  title={$_('editor.ai_interaction_title')}
  description={mode === 'parse' ? $_('editor.ai_parse_description') : $_('editor.ai_instruction_description')}
  placeholder={mode === 'parse' ? $_('editor.ai_parse_placeholder') : $_('editor.ai_instruction_placeholder')}
  cancelLabel={$_('editor.card_image_crop_cancel')}
  confirmLabel={mode === 'parse' ? $_('editor.ai_parse_confirm') : $_('editor.ai_instruction_confirm')}
  parsingLabel={mode === 'parse' ? $_('editor.ai_parsing') : $_('editor.ai_instruction_running')}
  parseModeLabel={$_('editor.ai_parse_mode')}
  instructionModeLabel={$_('editor.ai_instruction_mode')}
  resultTitle={$_('editor.ai_instruction_result_title')}
  resultText={resultText}
/>

<style>
  button {
    border: none;
    cursor: pointer;
  }

  .btn-sm {
    padding: 0.25rem 0.6rem;
    border-radius: var(--control-radius);
    font-size: 0.84rem;
    font-weight: 600;
  }

  .btn-secondary {
    color: var(--text-primary);
    background: var(--bg-surface-active);
  }

  .generation-group {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  span {
    color: var(--text-secondary);
    font-size: 0.8rem;
  }
</style>
