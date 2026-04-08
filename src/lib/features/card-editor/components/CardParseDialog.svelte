<script lang="ts">
  export let open = false;
  export let mode: 'parse' | 'instruction' = 'parse';
  export let manuscriptInput = '';
  export let isParsing = false;
  export let onModeChange: (mode: 'parse' | 'instruction') => void = () => {};
  export let onClose: () => void = () => {};
  export let onConfirm: () => void | Promise<void> = () => {};
  export let onBackdropKeydown: (event: KeyboardEvent) => void = () => {};
  export let closeAriaLabel = 'Close parse dialog';
  export let dialogAriaLabel = 'AI interaction';
  export let title = 'AI Interaction';
  export let description = 'Switch between manuscript parsing and instruction mode.';
  export let placeholder = 'Card name, effect text, stats...';
  export let cancelLabel = 'Cancel';
  export let confirmLabel = 'Confirm';
  export let parsingLabel = 'Processing...';
  export let parseModeLabel = 'Parse';
  export let instructionModeLabel = 'Instruction';
  export let resultTitle = 'Latest result';
  export let resultText = '';
</script>

{#if open}
  <div
    class="ai-modal-backdrop"
    role="button"
    tabindex="0"
    aria-label={closeAriaLabel}
    onclick={onClose}
    onkeydown={onBackdropKeydown}
  >
    <div
      class="ai-modal"
      role="dialog"
      tabindex="-1"
      aria-modal="true"
      aria-label={dialogAriaLabel}
      onclick={(event) => event.stopPropagation()}
      onkeydown={(event) => event.stopPropagation()}
    >
      <div class="ai-modal-header">
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <button class="close-dialog-btn" type="button" onclick={onClose}>×</button>
      </div>
      <div class="ai-mode-switch" role="tablist" aria-label={title}>
        <button
          class:active={mode === 'parse'}
          type="button"
          role="tab"
          aria-selected={mode === 'parse'}
          onclick={() => onModeChange('parse')}
          disabled={isParsing}
        >
          {parseModeLabel}
        </button>
        <button
          class:active={mode === 'instruction'}
          type="button"
          role="tab"
          aria-selected={mode === 'instruction'}
          onclick={() => onModeChange('instruction')}
          disabled={isParsing}
        >
          {instructionModeLabel}
        </button>
      </div>
      <textarea
        class="ai-modal-textarea"
        bind:value={manuscriptInput}
        placeholder={placeholder}
      ></textarea>
      {#if mode === 'instruction' && resultText}
        <div class="ai-result">
          <div class="ai-result-title">{resultTitle}</div>
          <div class="ai-result-body">{resultText}</div>
        </div>
      {/if}
      <div class="ai-modal-actions">
        <button class="btn-secondary btn-sm" type="button" onclick={onClose} disabled={isParsing}>
          {cancelLabel}
        </button>
        <button class="btn-primary btn-sm" type="button" onclick={onConfirm} disabled={isParsing}>
          {#if isParsing}
            {parsingLabel}
          {:else}
            {confirmLabel}
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .ai-modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1100;
    background: rgba(5, 10, 18, 0.72);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .ai-modal {
    width: min(860px, 94vw);
    min-height: 420px;
    background: var(--bg-surface);
    border: 1px solid var(--border-color);
    border-radius: 14px;
    box-shadow: 0 22px 60px rgba(0, 0, 0, 0.35);
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 18px;
  }
  .ai-modal-header,
  .ai-modal-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .ai-modal-header h3 {
    margin: 0;
    color: var(--text-primary);
    font-size: 1rem;
  }
  .ai-modal-header p {
    margin: 4px 0 0;
    color: var(--text-secondary);
    font-size: 0.86rem;
  }
  .close-dialog-btn {
    width: 32px;
    height: 32px;
    padding: 0;
    border-radius: 999px;
    background: var(--bg-surface-active);
    color: var(--text-primary);
  }
  .ai-modal-textarea {
    flex: 1;
    min-height: 240px;
    resize: vertical;
    font-size: 0.95rem;
    line-height: 1.5;
  }
  .ai-mode-switch {
    display: inline-flex;
    gap: 6px;
    padding: 4px;
    width: fit-content;
    border-radius: 999px;
    background: var(--bg-base);
    border: 1px solid var(--border-color);
  }
  .ai-mode-switch button {
    min-width: 110px;
    border-radius: 999px;
    background: transparent;
    color: var(--text-secondary);
  }
  .ai-mode-switch button.active {
    background: var(--accent-primary);
    color: #fff;
  }
  .ai-result {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 14px;
    border-radius: 10px;
    border: 1px solid var(--border-color);
    background: var(--bg-base);
    color: var(--text-primary);
  }
  .ai-result-title {
    font-size: 0.82rem;
    font-weight: 700;
    color: var(--text-secondary);
  }
  .ai-result-body {
    white-space: pre-wrap;
    line-height: 1.55;
    font-size: 0.9rem;
  }
</style>
