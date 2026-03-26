<script lang="ts">
  let {
    active = false,
    message = '',
    hint = '',
  }: {
    active?: boolean;
    message?: string;
    hint?: string;
  } = $props();
</script>

{#if active}
  <div class="drag-overlay" aria-live="polite">
    <div class="drag-overlay-panel">
      <div class="drag-overlay-icon" aria-hidden="true">
        <svg xmlns="http://www.w3.org/2000/svg" width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
      </div>
      <h2>{message}</h2>
      <p>{hint}</p>
    </div>
  </div>
{/if}

<style>
  .drag-overlay {
    position: absolute;
    inset: 0;
    z-index: 120;
    background: color-mix(in srgb, var(--bg-base) 68%, transparent);
    backdrop-filter: blur(6px);
    display: grid;
    place-items: center;
    pointer-events: none;
  }

  .drag-overlay-panel {
    min-width: min(520px, calc(100vw - 48px));
    max-width: 680px;
    padding: 32px 36px;
    border-radius: 24px;
    border: 1px solid color-mix(in srgb, var(--accent-primary) 35%, var(--border-color));
    background: color-mix(in srgb, var(--bg-surface) 88%, var(--bg-base));
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.3);
    text-align: center;
  }

  .drag-overlay-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 72px;
    height: 72px;
    margin-bottom: 14px;
    border-radius: 18px;
    background: color-mix(in srgb, var(--accent-primary) 14%, var(--bg-base));
    color: var(--accent-primary);
  }

  h2 {
    margin: 0 0 8px;
    font-size: 1.35rem;
    color: var(--text-primary);
  }

  p {
    margin: 0;
    color: var(--text-secondary);
  }
</style>
