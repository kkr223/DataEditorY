<script lang="ts">
  export let open = false;
  export let manuscriptInput = '';
  export let isParsing = false;
  export let onClose: () => void = () => {};
  export let onConfirm: () => void | Promise<void> = () => {};
  export let onBackdropKeydown: (event: KeyboardEvent) => void = () => {};
  export let closeAriaLabel = 'Close parse dialog';
  export let dialogAriaLabel = 'Parse card manuscript';
  export let title = 'AI Parse';
  export let description = 'Paste a card manuscript and turn it into one or more cards.';
  export let placeholder = 'Card name, effect text, stats...';
  export let cancelLabel = 'Cancel';
  export let confirmLabel = 'Confirm';
  export let parsingLabel = 'Parsing...';
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
      <textarea
        class="ai-modal-textarea"
        bind:value={manuscriptInput}
        placeholder={placeholder}
      ></textarea>
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
    min-height: 280px;
    resize: vertical;
    font-size: 0.95rem;
    line-height: 1.5;
  }
</style>
