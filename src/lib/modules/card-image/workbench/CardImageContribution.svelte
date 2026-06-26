<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { activateCardSurface } from '$lib/modules/card/workbench/surfaceState.svelte';
</script>

<button
  class="btn-secondary btn-sm image-button"
  type="button"
  onclick={() => activateCardSurface('image')}
>
  {$_('editor.card_image_button')}
</button>

<style>
  button {
    border: none;
    cursor: pointer;
  }

  .btn-sm {
    padding: 0.25rem 0.6rem;
    border-radius: var(--control-radius);
    font-size: 0.84rem;
    font-weight: 600;
  }

  .btn-secondary {
    color: var(--text-primary);
    background: var(--bg-surface-active);
  }

  .image-button {
    background: var(--feature-image-bg);
    box-shadow: inset 0 0 0 1px var(--feature-image-border);
  }
</style>
