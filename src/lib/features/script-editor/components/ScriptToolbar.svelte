<script lang="ts">
  import type { Snippet } from 'svelte';

  export let title = '';
  export let cardCodeLabel = '';
  export let cardName = '';
  export let cdbPath = '';
  export let isReloading = false;
  export let isSaving = false;
  export let extensionActions: Snippet | null = null;
  export let reloadLabel = '';
  export let reloadingLabel = '';
  export let checkDiagnosticsLabel = '';
  export let openExternalLabel = '';
  export let imageActionLabel = '';
  export let saveLabel = '';
  export let isSharingImage = false;
  export let sharingImageLabel = '';
  export let savingLabel = '';
  export let onReload: () => void | Promise<void>;
  export let onCheckDiagnostics: () => void | Promise<void>;
  export let onOpenExternal: () => void | Promise<void>;
  export let onShareImage: () => void | Promise<void>;
  export let onSave: () => void | Promise<void>;
</script>

<div class="script-toolbar">
  <div class="script-toolbar-main">
    <h2>{title}</h2>
    <div class="script-meta">
      <span>{cardCodeLabel}</span>
      <span>{cardName || '-'}</span>
      <span title={cdbPath}>{cdbPath}</span>
    </div>
  </div>
  <div class="script-toolbar-actions">
    {@render extensionActions?.()}
    <button class="btn-secondary" type="button" onclick={onReload} disabled={isReloading}>
      {isReloading ? reloadingLabel : reloadLabel}
    </button>
    <button class="btn-secondary" type="button" onclick={onCheckDiagnostics}>
      {checkDiagnosticsLabel}
    </button>
    <button class="btn-secondary" type="button" onclick={onOpenExternal}>
      {openExternalLabel}
    </button>
    <button class="btn-secondary" type="button" onclick={onShareImage} disabled={isSharingImage}>
      {isSharingImage ? sharingImageLabel : imageActionLabel}
    </button>
    <button class="btn-primary" type="button" onclick={onSave} disabled={isSaving}>
      {isSaving ? savingLabel : saveLabel}
    </button>
  </div>
</div>

<style>
  .script-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 6px 10px;
    border-bottom: 1px solid var(--border-color);
    background: color-mix(in srgb, var(--bg-surface) 88%, transparent);
  }

  .script-toolbar-main {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .script-toolbar-main h2 {
    margin: 0;
    font-size: var(--text-base);
    line-height: 1.15;
  }

  .script-meta {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    color: var(--text-secondary);
    font-size: var(--text-2xs);
    line-height: 1.2;
  }

  .script-meta span {
    max-width: 20rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .script-toolbar-actions {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }

  button {
    font: inherit;
  }

  .btn-primary,
  .btn-secondary {
    border-radius: var(--control-radius-soft);
    padding: 0.34rem 0.6rem;
    font-size: var(--text-xs);
    font-weight: 700;
    line-height: 1.1;
    transition: background-color var(--transition-fast), border-color var(--transition-fast);
  }

  .btn-primary {
    background: var(--accent-primary);
    color: var(--text-on-accent);
  }

  .btn-primary:hover {
    background: var(--accent-primary-hover);
  }

  .btn-secondary {
    background: var(--bg-base);
    border: 1px solid var(--border-color);
    color: var(--text-primary);
  }

  .btn-secondary:hover {
    background: var(--bg-surface-hover);
  }
</style>
