<script lang="ts">
  import { activeTabId } from '$lib/stores/db';
  import BatchCdbEditDialog from '$lib/features/shell/components/dialogs/BatchCdbEditDialog.svelte';
  import CardShowcaseImageDialog from '$lib/features/shell/components/dialogs/CardShowcaseImageDialog.svelte';
  import { cardToolState } from './cardTools.svelte';
  $effect(() => {
    if (cardToolState.request && cardToolState.request.tabId !== $activeTabId) cardToolState.request = null;
  });
</script>

{#if cardToolState.request && cardToolState.request.tabId === $activeTabId}
  {#key cardToolState.request.id}
    {#if cardToolState.request.kind === 'batch'}
      <BatchCdbEditDialog open={true} initialGroupId={cardToolState.request.groupId} onClose={() => { cardToolState.request = null; }} />
    {:else}
      <CardShowcaseImageDialog open={true} initialCardIds={cardToolState.request.cardIds} onClose={() => { cardToolState.request = null; }} />
    {/if}
  {/key}
{/if}
