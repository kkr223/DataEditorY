<script lang="ts">
  import { _ } from 'svelte-i18n';
  import CardImageDrawer from '$lib/components/CardImageDrawer.svelte';
  import {
    activeCardImageTab,
    closeCardImageTab,
    updateCardImageTabSnapshot,
  } from '$lib/stores/cardImageEditor.svelte';
  import type { CardImageWorkspaceSnapshot } from '$lib/types/card-image-workspace';

  function handleSnapshotChange(tabId: string, snapshot: CardImageWorkspaceSnapshot) {
    updateCardImageTabSnapshot(tabId, snapshot);
  }

  function handleClose(tabId: string) {
    closeCardImageTab(tabId);
  }
</script>

{#if $activeCardImageTab}
  {@const tab = $activeCardImageTab}
  <CardImageDrawer
    displayMode="workspace"
    open
    card={tab.card}
    cdbPath={tab.cdbPath}
    initialSnapshot={tab.snapshot}
    onSnapshotChange={(snapshot) => handleSnapshotChange(tab.id, snapshot)}
    onClose={() => handleClose(tab.id)}
  />
{:else}
  <div class="empty-workspace">
    <div class="empty-title">{$_('editor.card_image_empty_title')}</div>
    <div class="empty-hint">{$_('editor.card_image_empty_hint')}</div>
  </div>
{/if}

<style>
  .empty-workspace {
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: var(--text-secondary);
    background: var(--bg-surface);
  }

  .empty-title {
    color: var(--text-primary);
    font-weight: 700;
  }

  .empty-hint {
    font-size: 0.88rem;
  }
</style>
