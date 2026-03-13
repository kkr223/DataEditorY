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
    padding: 8px 14px;
    border-radius: 6px;
    font-size: 0.82rem;
    font-weight: 500;
    color: white;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
    animation: toast-in 0.25s ease-out;
    pointer-events: auto;
    max-width: 320px;
  }

  .toast-icon {
    font-size: 0.95rem;
    flex-shrink: 0;
  }

  .toast-success {
    background: linear-gradient(135deg, #22c55e, #16a34a);
  }

  .toast-error {
    background: linear-gradient(135deg, #ef4444, #dc2626);
  }

  .toast-info {
    background: linear-gradient(135deg, #3b82f6, #2563eb);
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
