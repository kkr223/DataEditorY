<script lang="ts">
  import { appShellState } from '$lib/stores/appShell.svelte';
  import WorkbenchHost from '$lib/platform/components/WorkbenchHost.svelte';

  let textEditorWorkbenchPromise: Promise<typeof import('$lib/components/TextEditorWorkbench.svelte')> | null = null;

  function loadTextEditorWorkbench() {
    return textEditorWorkbenchPromise ??= import('$lib/components/TextEditorWorkbench.svelte');
  }
</script>

{#if appShellState.mainView === 'text'}
  {#await loadTextEditorWorkbench() then module}
    {@const TextEditorWorkbench = module.default}
    <TextEditorWorkbench />
  {/await}
{:else}
  <WorkbenchHost />
{/if}
