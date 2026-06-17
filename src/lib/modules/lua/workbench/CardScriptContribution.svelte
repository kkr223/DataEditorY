<script lang="ts">
  import { _ } from 'svelte-i18n';
  import type { CardWorkbenchContext } from '$lib/modules/card/workbench/context';
  import { openCardScriptFlow } from '$lib/features/card-editor/useCases';

  let { context }: { context: CardWorkbenchContext } = $props();

  const openScript = () => openCardScriptFlow({
    activeCdbPath: context.activeCdbPath,
    activeTabId: context.activeDocumentId,
    draftCard: context.draftCard,
    t: context.t,
  });
</script>

<button class="btn-secondary btn-sm script-button" type="button" onclick={openScript}>
  {$_('editor.script_button')}
</button>

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

  .script-button {
    background: var(--feature-script-bg);
    box-shadow: inset 0 0 0 1px var(--feature-script-border);
  }
</style>
