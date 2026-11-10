<script lang="ts">
  import { _ } from 'svelte-i18n';
  let { maxSizeKb = $bindable(0) }: { maxSizeKb?: number } = $props();
</script>

<div class="settings-card">
  <h3>{$_('settings.card_image_export_title')}</h3>
  <label>
    <span>{$_('settings.card_image_max_size_kb')}</span>
    <input type="number" min="0" max="4294967295" step="1" bind:value={maxSizeKb} />
  </label>
  <p>{$_('settings.card_image_max_size_hint')}</p>
</div>

<style>
  .settings-card { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border: 1px solid var(--border-color); border-radius: var(--radius-card); background: var(--bg-surface); }
  h3 { margin: 0; font-size: var(--text-base); color: var(--text-primary); }
  label { display: flex; align-items: center; gap: 12px; font-size: var(--text-sm); color: var(--text-primary); }
  input { width: 130px; padding: 6px 8px; border: 1px solid var(--border-color); border-radius: var(--control-radius); background: var(--bg-base); color: var(--text-primary); }
  p { margin: 0; font-size: var(--text-xs); line-height: 1.5; color: var(--text-secondary); }
</style>
