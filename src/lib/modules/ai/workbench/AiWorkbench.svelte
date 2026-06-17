<script lang="ts">
  import { _ } from 'svelte-i18n';
</script>

<section class="ai-workbench">
  <h2>{$_('settings.ai_title')}</h2>
  <p>{$_('settings.ai_description')}</p>
</section>

<style>
  .ai-workbench {
    height: 100%;
    padding: 24px;
    color: var(--text-primary);
    background: var(--bg-base);
  }

  p {
    color: var(--text-secondary);
  }
</style>
