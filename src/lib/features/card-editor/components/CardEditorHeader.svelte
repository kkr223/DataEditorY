<script lang="ts">
  import type { CardDataEntry } from "$lib/types";

  export let draftCard: CardDataEntry;
  export let title = "";
  export let saveLabel = "";
  export let idLabel = "";
  export let aliasLabel = "";
  export let nameLabel = "";
  export let newCardLabel = "";
  export let onSave: () => void | Promise<void> = () => {};
  export let onNewCard: () => void = () => {};
</script>

<div class="editor-header">
  <h2>{title}</h2>
  <button class="btn-primary btn-sm" onclick={onSave}>{saveLabel}</button>
</div>

<div class="top-strip">
  <div class="strip-field" style="width:120px">
    <label for="edit-id">{idLabel}</label>
    <input type="number" id="edit-id" bind:value={draftCard.code} />
  </div>
  <div class="strip-field" style="width:90px">
    <label for="edit-alias">{aliasLabel}</label>
    <input type="number" id="edit-alias" bind:value={draftCard.alias} />
  </div>
  <div class="strip-field" style="flex:1">
    <label for="edit-name">{nameLabel}</label>
    <input type="text" id="edit-name" bind:value={draftCard.name} />
  </div>
  <button class="btn-secondary btn-sm top-action" onclick={onNewCard}>{newCardLabel}</button>
</div>

<style>
  .editor-header {
    height: 2.5rem;
    min-height: 2.5rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 10px;
    border-bottom: 1px solid var(--border-color);
  }

  .editor-header h2 {
    font-size: 1rem;
    font-weight: 600;
  }

  .top-strip {
    display: flex;
    gap: 6px;
    padding: 6px 10px;
    border-bottom: 1px solid var(--border-color);
    background: var(--bg-base);
    align-items: end;
  }

  .top-action {
    height: fit-content;
  }

  .strip-field {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .strip-field label {
    font-size: 0.82rem;
    color: var(--text-secondary);
    font-weight: 600;
  }

  .strip-field input {
    padding: 0.25rem 0.45rem;
    font-size: 0.9rem;
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
</style>
