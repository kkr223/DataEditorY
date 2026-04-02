<script lang="ts">
  export let open = false;
  export let imageSrc = "";
  export let closeAriaLabel = "Close image preview";
  export let dialogAriaLabel = "Card image preview";
  export let previewAlt = "Card preview";
  export let onClose: () => void = () => {};

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      onClose();
    }
  }
</script>

{#if open}
  <div
    class="image-preview-backdrop"
    role="button"
    tabindex="0"
    aria-label={closeAriaLabel}
    onclick={onClose}
    onkeydown={handleKeydown}
  >
    <div
      class="image-preview-dialog"
      role="dialog"
      tabindex="-1"
      aria-modal="true"
      aria-label={dialogAriaLabel}
      onclick={(event) => event.stopPropagation()}
      onkeydown={(event) => event.stopPropagation()}
    >
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
    max-width: min(92vw, 900px);
    max-height: 92vh;
    border-radius: 10px;
    overflow: hidden;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);
    background: var(--bg-elevated);
    border: 1px solid var(--border-color);
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
