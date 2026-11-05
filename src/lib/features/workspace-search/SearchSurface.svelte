<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { activeTab } from '#lib/stores/db.ts';
  import SearchPanel from './SearchPanel.svelte';
</script>

{#if $activeTab}
  {#key JSON.stringify([$activeTab.id, $activeTab.path])}
    <SearchPanel tab={$activeTab} />
  {/key}
{:else}
  <p>{$_('workspace_search.no_cdb')}</p>
{/if}
