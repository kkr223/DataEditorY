<script lang="ts">
  import { _ } from 'svelte-i18n';
  import {
    flushAllWorkspaceMetadataSaves,
    loadWorkspaceMetadataForPath,
    workspaceMetadataState,
  } from '$lib/features/workspace-metadata/state.svelte';

  let retrying = $state(false);
  const saveErrors = $derived(Object.values(workspaceMetadataState.saveErrors));

  async function retry() {
    retrying = true;
    try {
      await flushAllWorkspaceMetadataSaves();
      if (!workspaceMetadataState.ready && workspaceMetadataState.cdbPath) {
        await loadWorkspaceMetadataForPath(workspaceMetadataState.cdbPath);
      }
    } catch {
      // The retained snapshot and error remain available for another retry.
    } finally {
      retrying = false;
    }
  }
</script>

{#if saveErrors.length || workspaceMetadataState.error}
  <div class="metadata-status" role="alert">
    <div class="messages">
      {#each saveErrors as error (error.path)}
        <p>{$_('surface.metadata_save_failed')} <span>{error.path}: {error.message}</span></p>
      {/each}
      {#if workspaceMetadataState.error}
        <p>{$_('surface.metadata_load_failed')} <span>{workspaceMetadataState.error}</span></p>
      {/if}
    </div>
    <button type="button" disabled={retrying} onclick={() => void retry()}>
      {$_('surface.metadata_retry')}
    </button>
  </div>
{/if}

<style>
  .metadata-status {
    display: flex;
    gap: 1rem;
    align-items: center;
    padding: 0.5rem 1rem;
    border-bottom: 1px solid var(--border-color);
    background: var(--bg-surface);
    color: var(--danger-text, #f87171);
  }
  .messages { flex: 1; min-width: 0; max-height: 6rem; overflow: auto; }
  p { margin: 0; overflow-wrap: anywhere; font-size: 0.85rem; }
  span { opacity: 0.85; }
  button { flex-shrink: 0; padding: 0.3rem 0.7rem; cursor: pointer; }
  button:disabled { cursor: wait; opacity: 0.6; }
</style>
