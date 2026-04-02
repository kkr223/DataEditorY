<script lang="ts">
  export let isEditingExisting = false;
  export let editingHint = "";
  export let newCardHint = "";
  export let newCardLabel = "";
  export let aiParseLabel = "";
  export let scriptLabel = "";
  export let generateScriptLabel = "";
  export let generatingScriptLabel = "";
  export let cancelScriptLabel = "";
  export let cardImageLabel = "";
  export let saveAsLabel = "";
  export let modifyLabel = "";
  export let deleteLabel = "";
  export let hasAiCapability = false;
  export let hasCardImageCapability = false;
  export let isGeneratingScript = false;
  export let scriptStageText = "";
  export let onNewCard: () => void = () => {};
  export let onOpenParseModal: () => void | Promise<void> = () => {};
  export let onOpenScript: () => void | Promise<void> = () => {};
  export let onGenerateScript: () => void | Promise<void> = () => {};
  export let onCancelGenerateScript: () => void = () => {};
  export let onOpenCardImageDrawer: () => void = () => {};
  export let onSaveAs: () => void | Promise<void> = () => {};
  export let onModify: () => void | Promise<void> = () => {};
  export let onDelete: () => void | Promise<void> = () => {};
</script>

<div class="editor-empty-hint">
  {#if isEditingExisting}
    {editingHint}
  {:else}
    {newCardHint}
  {/if}
</div>

<div class="editor-bottom">
  <div class="editor-bottom-left">
    <button class="btn-secondary btn-sm" onclick={onNewCard}>{newCardLabel}</button>
    {#if hasAiCapability}
      <button class="btn-secondary btn-sm" onclick={onOpenParseModal}>{aiParseLabel}</button>
    {/if}
    <button class="btn-secondary btn-sm btn-secondary-script" onclick={onOpenScript}>{scriptLabel}</button>
    {#if hasAiCapability}
      <div class="script-generate-group">
        <button class="btn-secondary btn-sm" onclick={onGenerateScript} disabled={isGeneratingScript}>
          {isGeneratingScript ? generatingScriptLabel : generateScriptLabel}
        </button>
        {#if isGeneratingScript}
          <button class="btn-secondary btn-sm" type="button" onclick={onCancelGenerateScript}>
            {cancelScriptLabel}
          </button>
          <span class="script-stage-text">{scriptStageText}</span>
        {/if}
      </div>
    {/if}
    {#if hasCardImageCapability}
      <button class="btn-secondary btn-sm btn-secondary-card-image" onclick={onOpenCardImageDrawer}>{cardImageLabel}</button>
    {/if}
  </div>
  <div class="btn-group">
    <button class="btn-secondary btn-sm" onclick={onSaveAs}>{saveAsLabel}</button>
    <button class="btn-primary btn-sm" onclick={onModify}>{modifyLabel}</button>
    <button class="btn-danger btn-sm" onclick={onDelete} disabled={!isEditingExisting}>{deleteLabel}</button>
  </div>
</div>

<style>
  .editor-empty-hint {
    padding: 0 10px 8px;
    color: var(--text-secondary);
    font-size: 0.85rem;
  }

  .editor-bottom {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 10px;
    border-top: 1px solid var(--border-color);
    flex-shrink: 0;
  }

  .editor-bottom-left {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    align-items: center;
  }

  .script-generate-group {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .script-stage-text {
    font-size: 0.8rem;
    color: var(--text-secondary);
    white-space: nowrap;
  }

  .btn-group {
    display: flex;
    gap: 6px;
  }

  button {
    font-size: 0.9rem;
    font-weight: 600;
    padding: 4px 10px;
    border-radius: 4px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    transition: all 0.15s;
    cursor: pointer;
    border: none;
  }

  .btn-sm {
    padding: 0.25rem 0.6rem;
    font-size: 0.84rem;
  }

  .btn-primary {
    background: var(--accent-primary);
    color: white;
  }

  .btn-primary:hover {
    background: var(--accent-primary-hover);
  }

  .btn-secondary {
    background: var(--bg-surface-active);
    color: var(--text-primary);
  }

  .btn-secondary:hover {
    background: var(--bg-surface-hover);
  }

  .btn-secondary-script {
    background: color-mix(in srgb, #0ea5e9 18%, var(--bg-surface-active));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, #0ea5e9 24%, transparent);
  }

  .btn-secondary-script:hover {
    background: color-mix(in srgb, #0ea5e9 26%, var(--bg-surface-hover));
  }

  .btn-secondary-card-image {
    background: color-mix(in srgb, #f59e0b 16%, var(--bg-surface-active));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, #f59e0b 24%, transparent);
  }

  .btn-secondary-card-image:hover {
    background: color-mix(in srgb, #f59e0b 24%, var(--bg-surface-hover));
  }

  .btn-danger {
    background: #dc2626;
    color: white;
  }

  .btn-danger:hover {
    background: #b91c1c;
  }
</style>
