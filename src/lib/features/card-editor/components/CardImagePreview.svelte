<script lang="ts">
  import { tick } from 'svelte';
  import { appSettingsState } from '$lib/stores/appSettings.svelte';
  import { isShortcutEvent } from '$lib/features/shortcuts/registry';

  export let open = false;
  export let imageSrc = "";
  export let closeAriaLabel = "Close image preview";
  export let dialogAriaLabel = "Card image preview";
  export let previewAlt = "Card preview";
  export let onClose: () => void = () => {};

  let closeButton: HTMLButtonElement | null = null;
  let lastOpen = false;

  $: if (open !== lastOpen) {
    if (open) {
      void tick().then(() => closeButton?.focus());
    }
    lastOpen = open;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (isShortcutEvent('cardEditor.dismissOverlay', event, appSettingsState.values.shortcutBindings)) {
      event.preventDefault();
      onClose();
    }
  }
</script>

{#if open}
  <div
    class="image-preview-backdrop"
    role="presentation"
    onkeydown={handleKeydown}
  >
    <div
      class="image-preview-dialog"
      role="dialog"
      tabindex="-1"
      aria-modal="true"
      aria-label={dialogAriaLabel}
    >
      <button bind:this={closeButton} type="button" class="image-preview-close" aria-label={closeAriaLabel} onclick={onClose}>×</button>
      <img src={imageSrc} alt={previewAlt} class="image-preview-img" />
    </div>
  </div>
{/if}

<style>
  .image-preview-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1000;
    background: rgba(5, 10, 18, 0.82);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }

  .image-preview-dialog {
    position: relative;
    max-width: min(92vw, 900px);
    max-height: 92vh;
    border-radius: 10px;
    overflow: hidden;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);
    background: var(--bg-elevated);
    border: 1px solid var(--border-color);
  }

  .image-preview-close {
    position: absolute;
    top: 10px;
    right: 10px;
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 999px;
    background: rgba(15, 23, 42, 0.72);
    color: white;
    cursor: pointer;
    z-index: 1;
  }

  .image-preview-img {
    display: block;
    width: 100%;
    max-width: min(92vw, 900px);
    max-height: 92vh;
    object-fit: contain;
    background: #000;
  }
</style>
