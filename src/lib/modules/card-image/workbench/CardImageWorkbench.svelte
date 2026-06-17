<script lang="ts">
  import { _ } from 'svelte-i18n';
</script>

<section class="standalone-workbench">
  <h2>{$_('editor.card_image_title')}</h2>
  <p>{$_('editor.card_image_description')}</p>
</section>

<style>
  .standalone-workbench {
    height: 100%;
    padding: 24px;
    color: var(--text-primary);
    background: var(--bg-base);
  }

  p {
    color: var(--text-secondary);
  }
</style>
