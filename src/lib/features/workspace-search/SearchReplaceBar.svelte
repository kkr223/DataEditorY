<script lang="ts">
  import { _ } from 'svelte-i18n';
  import type { WorkspaceReplacePreview } from './types';
  let { replacement, preview, planning, disabled, canPreview, regex, onChange, onPreview, onApply }: {
    replacement: string;
    preview: WorkspaceReplacePreview | null;
    planning: boolean;
    disabled: boolean;
    canPreview: boolean;
    regex: boolean;
    onChange: (value: string) => void;
    onPreview: () => void;
    onApply: () => void;
  } = $props();
</script>

<div class="replace-bar" aria-label={$_('workspace_search.replace_title')}>
  <div class="replace-row">
    <input aria-label={$_('workspace_search.replacement')} placeholder={$_('workspace_search.replacement_hint')}
      value={replacement} {disabled} oninput={(event) => onChange(event.currentTarget.value)} />
    <button type="button" disabled={disabled || planning || !canPreview} onclick={onPreview}>
      {$_(planning ? 'workspace_search.planning' : 'workspace_search.preview_replace')}
    </button>
    <button type="button" class="apply" disabled={disabled || planning || !preview?.edits.length} onclick={onApply}>
      {$_('workspace_search.apply_replace', { values: { count: preview?.edits.length ?? 0 } })}
    </button>
  </div>
  <p class="hint">{$_('workspace_search.save_hint')}{#if regex} {$_('workspace_search.capture_hint', { values: { capture: '${name}' } })}{/if}</p>
  {#if preview}
    <p class="summary" role="status">{$_(preview.edits.length ? 'workspace_search.replace_summary' : 'workspace_search.no_changes', {
      values: { count: preview.edits.length, cards: preview.cards.length, scripts: preview.scripts.length },
    })}</p>
  {/if}
</div>

<style>
  .replace-bar { margin-top: 9px; }
  .replace-row { display: flex; gap: 6px; }
  input { flex: 1; min-width: 90px; padding: 8px 10px; }
  button { padding: 7px 10px; border: 1px solid var(--border-color); border-radius: var(--control-radius); white-space: nowrap; }
  button:hover:not(:disabled) { background: var(--bg-surface-hover); }
  button:disabled { opacity: .45; cursor: default; }
  .apply { color: var(--accent-primary); border-color: var(--accent-primary); }
  .hint, .summary { margin: 8px 0 0; color: var(--text-disabled); font-size: var(--text-xs); line-height: 1.5; }
  .summary { color: var(--text-secondary); }
  @media (max-width: 850px) { .replace-row { flex-wrap: wrap; } }
</style>
