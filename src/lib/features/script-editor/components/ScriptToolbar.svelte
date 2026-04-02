<script lang="ts">
  export let title = '';
  export let cardCodeLabel = '';
  export let cardName = '';
  export let cdbPath = '';
  export let hasAiCapability = false;
  export let isGeneratingScript = false;
  export let isReloading = false;
  export let isSaving = false;
  export let stageLabel = '';
  export let generateLabel = '';
  export let generatingLabel = '';
  export let cancelLabel = '';
  export let reloadLabel = '';
  export let reloadingLabel = '';
  export let openExternalLabel = '';
  export let saveLabel = '';
  export let savingLabel = '';
  export let onGenerate: () => void | Promise<void> = () => {};
  export let onCancelGenerate: () => void = () => {};
  export let onReload: () => void | Promise<void> = () => {};
  export let onOpenExternal: () => void | Promise<void> = () => {};
  export let onSave: () => void | Promise<void> = () => {};
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
    {#if hasAiCapability}
      <button class="btn-secondary" type="button" onclick={onGenerate} disabled={isGeneratingScript}>
        {isGeneratingScript ? generatingLabel : generateLabel}
      </button>
      {#if isGeneratingScript}
        <button class="btn-secondary" type="button" onclick={onCancelGenerate}>
          {cancelLabel}
        </button>
      {/if}
    {/if}
    <button class="btn-secondary" type="button" onclick={onReload} disabled={isReloading}>
      {isReloading ? reloadingLabel : reloadLabel}
    </button>
    <button class="btn-secondary" type="button" onclick={onOpenExternal}>
      {openExternalLabel}
    </button>
    <button class="btn-primary" type="button" onclick={onSave} disabled={isSaving}>
      {isSaving ? savingLabel : saveLabel}
    </button>
  </div>
</div>

{#if hasAiCapability && isGeneratingScript}
  <div class="script-stage-banner">{stageLabel}</div>
{/if}

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
    font-size: 0.9rem;
    line-height: 1.15;
  }

  .script-meta {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    color: var(--text-secondary);
    font-size: 0.72rem;
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

  .script-stage-banner {
    padding: 4px 10px;
    border-bottom: 1px solid color-mix(in srgb, var(--border-color) 88%, transparent);
    color: var(--text-secondary);
    font-size: 0.72rem;
    line-height: 1.2;
    background: color-mix(in srgb, var(--bg-surface) 82%, transparent);
  }

  button {
    font: inherit;
  }

  .btn-primary,
  .btn-secondary {
    border-radius: 8px;
    padding: 0.34rem 0.6rem;
    font-size: 0.76rem;
    font-weight: 700;
    line-height: 1.1;
  }

  .btn-primary {
    background: linear-gradient(135deg, #2563eb, #0891b2);
    color: white;
  }

  .btn-secondary {
    background: var(--bg-base);
    border: 1px solid var(--border-color);
    color: var(--text-primary);
  }
</style>
