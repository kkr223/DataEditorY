<script lang="ts">
  import { _ } from 'svelte-i18n';
  import type { LuaWorkbenchContext } from '$lib/modules/lua/workbench/context';
  import type { ScriptGenerationStage } from '$lib/services/scriptGenerationStages';
  import { getScriptGenerationStageLabel } from '$lib/services/scriptGenerationStages';
  import { generateScriptFromEditorFlow } from '$lib/features/script-editor/extraUseCases';

  let { context }: { context: LuaWorkbenchContext } = $props();
  let generating = $state(false);
  let stage = $state<ScriptGenerationStage | ''>('');
  let abortController = $state<AbortController | null>(null);

  const generate = () => generateScriptFromEditorFlow({
    tab: context.activeScript,
    isGeneratingScript: generating,
    cardContext: context.card,
    dbTabs: context.databaseDocuments,
    t: context.t,
    setIsGeneratingScript: (value) => { generating = value; },
    setScriptGenerationStage: (value) => { stage = value; },
    setAbortController: (value) => { abortController = value; },
  });
</script>

<button class="btn-secondary" type="button" onclick={generate} disabled={generating}>
  {generating ? $_('editor.script_generating') : $_('editor.script_generate_button')}
</button>
{#if generating}
  <button class="btn-secondary" type="button" onclick={() => abortController?.abort()}>
    {$_('editor.script_cancel_button')}
  </button>
  <span class="stage">{getScriptGenerationStageLabel($_, stage)}</span>
{/if}

<style>
  button {
    font: inherit;
  }

  .btn-secondary {
    border-radius: 8px;
    padding: 0.34rem 0.6rem;
    font-size: 0.76rem;
    font-weight: 700;
    line-height: 1.1;
    background: var(--bg-base);
    border: 1px solid var(--border-color);
    color: var(--text-primary);
  }

  .stage {
    color: var(--text-secondary);
    font-size: 0.72rem;
  }
</style>
