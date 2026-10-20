<script lang="ts">
  export let title = '';
  export let saveLabel = '';
  export let savingLabel = '';
  export let saving = false;
  export let disabled = false;
  export let onSave: () => unknown | Promise<unknown>;
</script>

<header class="sp-header">
  <h2>{title}</h2>
  <button class="sp-save" type="button" onclick={onSave} disabled={saving || disabled}>
    {saving ? savingLabel : saveLabel}
  </button>
</header>

<style>
  .sp-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
    flex-shrink: 0;
  }
  .sp-header h2 {
    margin: 0;
    font-size: var(--text-lg);
    font-weight: 700;
    color: var(--text-primary);
  }
  .sp-save {
    flex-shrink: 0;
    padding: 7px 16px;
    border-radius: var(--control-radius-soft);
    font-size: var(--text-sm);
    font-weight: 700;
    color: var(--text-on-accent);
    background: var(--accent-primary);
    box-shadow: var(--shadow-soft);
    border: 1px solid transparent;
    cursor: pointer;
    transition: background-color var(--transition-fast), box-shadow var(--transition-fast);
  }
  .sp-save:hover:not(:disabled) { background: var(--accent-primary-hover); box-shadow: var(--shadow-popover); }
  .sp-save:disabled { opacity: 0.55; cursor: not-allowed; }

  @media (max-width: 780px) {
    .sp-header {
      flex-direction: column;
      align-items: stretch;
    }

    .sp-save {
      width: 100%;
    }
  }
</style>
