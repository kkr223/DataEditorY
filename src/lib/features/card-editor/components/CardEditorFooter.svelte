<script lang="ts">
  export let isEditingExisting = false;
  export let editingHint = "";
  export let newCardHint = "";
  export let backgroundTaskLabel = "";
  export let backgroundTaskProgressText = "";
  export let backgroundQueuedCount = 0;
  export let resetSearchLabel = "";
  export let newCardLabel = "";
  export let aiParseLabel = "";
  export let scriptLabel = "";
  export let generateScriptLabel = "";
  export let generatingScriptLabel = "";
  export let cancelScriptLabel = "";
  export let cardImageLabel = "";
  export let searchLabel = "";
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
  export let onResetSearch: () => void | Promise<void> = () => {};
  export let onSearch: () => void | Promise<void> = () => {};
  export let onSaveAs: () => void | Promise<void> = () => {};
  export let onModify: () => void | Promise<void> = () => {};
  export let onDelete: () => void | Promise<void> = () => {};
</script>

<div class="editor-meta-row">
  <div class="editor-empty-hint">
    {#if isEditingExisting}
      {editingHint}
    {:else}
      {newCardHint}
    {/if}
  </div>
  {#if backgroundTaskLabel}
    <div class="background-task-status" aria-live="polite">
      <span class="background-task-dot"></span>
      <span class="background-task-label">{backgroundTaskLabel}</span>
      {#if backgroundTaskProgressText}
        <span class="background-task-progress">{backgroundTaskProgressText}</span>
      {/if}
      {#if backgroundQueuedCount > 0}
        <span class="background-task-queue">+{backgroundQueuedCount}</span>
      {/if}
    </div>
  {/if}
</div>

<div class="editor-bottom">
  <div class="editor-bottom-left">
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
    <button class="btn-secondary btn-sm" onclick={onResetSearch}>{resetSearchLabel}</button>
    <button class="btn-secondary btn-sm" onclick={onNewCard}>{newCardLabel}</button>
    <button class="btn-secondary btn-sm" onclick={onSearch}>{searchLabel}</button>
    <button class="btn-secondary btn-sm" onclick={onSaveAs}>{saveAsLabel}</button>
    <button class="btn-primary btn-sm" onclick={onModify}>{modifyLabel}</button>
    <button class="btn-danger btn-sm" onclick={onDelete} disabled={!isEditingExisting}>{deleteLabel}</button>
  </div>
</div>

<style>
  .editor-meta-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 0 10px 8px;
  }

  .editor-empty-hint {
    min-width: 0;
    flex: 1;
    color: var(--text-secondary);
    font-size: 0.85rem;
  }

  .background-task-status {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    min-width: 0;
    max-width: min(32rem, 100%);
    padding: 0.36rem 0.72rem;
    border-radius: var(--control-radius-pill);
    border: 1px solid color-mix(in srgb, var(--accent-primary) 24%, var(--border-color));
    background: color-mix(in srgb, var(--accent-primary) 10%, var(--bg-surface-active));
    color: var(--text-primary);
    font-size: 0.8rem;
    line-height: 1;
    white-space: nowrap;
  }

  .background-task-dot {
    width: 0.46rem;
    height: 0.46rem;
    border-radius: var(--control-radius-pill);
    background: var(--accent-primary);
    box-shadow: 0 0 0 0.2rem color-mix(in srgb, var(--accent-primary) 18%, transparent);
    flex-shrink: 0;
  }

  .background-task-label {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .background-task-progress,
  .background-task-queue {
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
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
    border-radius: var(--control-radius);
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
    background: var(--feature-script-bg);
    box-shadow: inset 0 0 0 1px var(--feature-script-border);
  }

  .btn-secondary-script:hover {
    background: var(--feature-script-bg-hover);
  }

  .btn-secondary-card-image {
    background: var(--feature-image-bg);
    box-shadow: inset 0 0 0 1px var(--feature-image-border);
  }

  .btn-secondary-card-image:hover {
    background: var(--feature-image-bg-hover);
  }

  .btn-danger {
    background: var(--state-danger-bg);
    color: var(--state-danger-text);
  }

  .btn-danger:hover {
    background: var(--state-danger-bg-hover);
  }

  @media (max-width: 1180px) {
    .editor-meta-row {
      flex-wrap: wrap;
      align-items: flex-start;
    }

    .editor-empty-hint {
      padding: 0;
    }

    .background-task-status {
      width: 100%;
      justify-content: flex-start;
      max-width: none;
    }
  }
</style>
