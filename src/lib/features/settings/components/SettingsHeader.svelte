<script lang="ts">
  export let title = '';
  export let description = '';
  export let saveLabel = '';
  export let savingLabel = '';
  export let saving = false;
  export let onSave: () => void | Promise<void> = () => {};
</script>

<header class="sp-header">
  <div>
    <h2>{title}</h2>
    <p class="sp-subtitle">{description}</p>
  </div>
  <button class="sp-save" type="button" onclick={onSave} disabled={saving}>
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
    font-size: 1.15rem;
    font-weight: 700;
    color: var(--text-primary);
  }
  .sp-subtitle {
    margin: 1px 0 0;
    font-size: 0.78rem;
    color: var(--text-secondary);
  }
  .sp-save {
    flex-shrink: 0;
    padding: 7px 16px;
    border-radius: 8px;
    font-size: 0.82rem;
    font-weight: 700;
    color: #fff;
    background: linear-gradient(135deg, #0d9488, #14b8a6);
    box-shadow: 0 2px 8px rgba(20, 184, 166, 0.25);
    border: none;
    cursor: pointer;
    transition: filter 0.15s, box-shadow 0.15s;
  }
  .sp-save:hover:not(:disabled) { filter: brightness(1.08); box-shadow: 0 4px 14px rgba(20, 184, 166, 0.35); }
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
