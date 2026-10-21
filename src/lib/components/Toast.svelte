<script lang="ts">
  import { toasts } from '$lib/stores/toast.svelte';
</script>

{#if toasts.length > 0}
  <div class="toast-container">
    {#each toasts as toast (toast.id)}
      <div class="toast toast-{toast.type}" role="alert">
        <span class="toast-icon">
          {#if toast.type === 'success'}✓{:else if toast.type === 'error'}✗{:else}ℹ{/if}
        </span>
        <span class="toast-message">{toast.message}</span>
      </div>
    {/each}
  </div>
{/if}

<style>
  .toast-container {
    position: fixed;
    top: 12px;
    right: 12px;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: 8px;
    pointer-events: none;
  }

  .toast {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 15px;
    border: 1px solid color-mix(in srgb, white 16%, transparent);
    border-radius: var(--control-radius-soft);
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--text-on-accent);
    box-shadow: var(--shadow-popover);
    animation: toast-in 0.25s ease-out;
    pointer-events: auto;
    max-width: 360px;
  }

  .toast-icon {
    font-size: var(--text-md);
    flex-shrink: 0;
  }

  .toast-success {
    background: var(--state-success-bg);
  }

  .toast-error {
    background: var(--state-danger-bg);
  }

  .toast-info {
    background: var(--state-info-bg);
  }

  @keyframes toast-in {
    from {
      opacity: 0;
      transform: translateX(20px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }
</style>
