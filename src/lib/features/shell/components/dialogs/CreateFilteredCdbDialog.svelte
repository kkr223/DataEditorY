<script lang="ts">
  import { _ } from 'svelte-i18n';

  let {
    open = false,
    state,
    onClose = () => {},
    onConfirm = async () => {},
  }: {
    open?: boolean;
    state: {
      copyFilteredAssets: boolean;
      isCreatingFilteredCdb: boolean;
    };
    onClose?: () => void;
    onConfirm?: () => void | Promise<void>;
  } = $props();
</script>

{#if open}
  <div class="shell-dialog-backdrop" role="presentation" onclick={(event) => event.currentTarget === event.target && onClose()}>
    <div class="shell-dialog" role="dialog" aria-modal="true" aria-label={$_('editor.create_filtered_cdb_title')}>
      <div class="shell-dialog-header">
        <div>
          <h3>{$_('editor.create_filtered_cdb_title')}</h3>
          <p>{$_('editor.create_filtered_cdb_hint')}</p>
        </div>
        <button class="close-dialog-btn" type="button" onclick={onClose}>×</button>
      </div>
      <div class="shell-dialog-body">
        <label class="shell-toggle">
          <input type="checkbox" bind:checked={state.copyFilteredAssets} />
          <span>{$_('editor.create_filtered_cdb_copy_assets')}</span>
        </label>
        <p class="shell-dialog-hint">
          {state.copyFilteredAssets ? $_('editor.create_filtered_cdb_copy_assets_yes') : $_('editor.create_filtered_cdb_copy_assets_no')}
        </p>
      </div>
      <div class="shell-dialog-actions">
        <button class="btn-secondary btn-sm" type="button" onclick={onClose} disabled={state.isCreatingFilteredCdb}>{$_('editor.cancel')}</button>
        <button class="btn-primary btn-sm" type="button" onclick={onConfirm} disabled={state.isCreatingFilteredCdb}>
          {state.isCreatingFilteredCdb ? $_('editor.create_filtered_cdb_creating') : $_('editor.create_filtered_cdb_confirm')}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .shell-dialog-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1600;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: var(--dialog-backdrop);
    backdrop-filter: blur(4px);
  }

  .shell-dialog {
    width: min(560px, 94vw);
    max-height: 92vh;
    display: flex;
    flex-direction: column;
    background: var(--bg-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--dialog-radius);
    overflow: hidden;
    box-shadow: var(--dialog-shadow);
  }

  .shell-dialog-header,
  .shell-dialog-actions {
    padding: 16px 18px;
    border-bottom: 1px solid var(--border-color);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .shell-dialog-actions {
    border-bottom: none;
    border-top: 1px solid var(--border-color);
    justify-content: flex-end;
  }

  .shell-dialog-header h3 {
    margin: 0;
    font-size: 1rem;
  }

  .shell-dialog-header p,
  .shell-dialog-hint {
    margin: 4px 0 0;
    color: var(--text-secondary);
    font-size: 0.84rem;
  }

  .shell-dialog-body {
    padding: 18px;
    overflow: auto;
  }

  .shell-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border: 1px solid var(--border-color);
    border-radius: var(--control-radius-soft);
    background: var(--bg-base);
    min-width: 0;
  }

  .shell-toggle input {
    width: auto;
    margin: 0;
  }

  .btn-sm {
    padding: 0.42rem 0.8rem;
    font-size: 0.84rem;
    font-weight: 700;
    border-radius: var(--control-radius-soft);
    border: none;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-primary {
    background: var(--accent-primary);
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--accent-primary-hover);
  }

  .btn-secondary {
    background: var(--interactive-soft-bg);
    color: var(--text-primary);
    border: 1px solid var(--interactive-soft-border);
  }

  .btn-secondary:hover:not(:disabled) {
    background: var(--bg-surface-hover);
  }

  .close-dialog-btn {
    width: 32px;
    height: 32px;
    padding: 0;
    font-size: 1.35rem;
    line-height: 1;
    border-radius: var(--control-radius-pill);
    background: var(--bg-surface-active);
    color: var(--text-primary);
    border: none;
    cursor: pointer;
    transition: background-color 0.15s ease, color 0.15s ease;
  }

  .close-dialog-btn:hover {
    background: var(--bg-surface-hover);
  }
</style>
