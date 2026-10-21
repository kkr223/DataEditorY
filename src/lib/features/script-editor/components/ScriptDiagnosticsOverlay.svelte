<script lang="ts">
  import { tick } from 'svelte';
  import { disableAutofill } from '$lib/actions/disableAutofill';
  import type { LuaScriptDiagnostic } from '$lib/features/script-editor/lua/diagnostics';

  export let open = false;
  export let title = '';
  export let summaryText = '';
  export let emptyText = '';
  export let closeLabel = '';
  export let lineColumnLabel = '';
  export let errorLabel = '';
  export let warningLabel = '';
  export let diagnostics: LuaScriptDiagnostic[] = [];
  export let onClose: () => void = () => {};
  export let onSelect: (diagnostic: LuaScriptDiagnostic) => void = () => {};

  let closeButton: HTMLButtonElement | null = null;
  let lastOpen = false;

  $: if (open !== lastOpen) {
    if (open) {
      void tick().then(() => closeButton?.focus());
    }
    lastOpen = open;
  }

  function handleBackdropKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  }

  function formatLineColumn(diagnostic: LuaScriptDiagnostic) {
    return lineColumnLabel
      .replace('{line}', String(diagnostic.startLineNumber))
      .replace('{column}', String(diagnostic.startColumn));
  }

  function severityLabel(diagnostic: LuaScriptDiagnostic) {
    return diagnostic.severity === 'error' ? errorLabel : warningLabel;
  }
</script>

{#if open}
  <div
    class="script-diagnostics-overlay"
    role="dialog"
    aria-modal="false"
    aria-label={title}
    tabindex="-1"
    onkeydown={handleBackdropKeydown}
  >
    <section class="script-diagnostics-panel" use:disableAutofill>
      <header class="script-diagnostics-header">
        <div>
          <h3>{title}</h3>
          <p>{summaryText}</p>
        </div>
        <button bind:this={closeButton} type="button" class="script-diagnostics-close" onclick={onClose}>{closeLabel}</button>
      </header>

      <div class="script-diagnostics-list">
        {#if diagnostics.length > 0}
          {#each diagnostics as diagnostic, index (`${diagnostic.startLineNumber}:${diagnostic.startColumn}:${index}`)}
            <button
              type="button"
              class="script-diagnostics-item"
              class:error={diagnostic.severity === 'error'}
              class:warning={diagnostic.severity === 'warning'}
              onclick={() => onSelect(diagnostic)}
            >
              <span class="script-diagnostics-position">{formatLineColumn(diagnostic)}</span>
              <span class="script-diagnostics-severity">{severityLabel(diagnostic)}</span>
              <span class="script-diagnostics-message">{diagnostic.message}</span>
            </button>
          {/each}
        {:else}
          <div class="script-diagnostics-empty">{emptyText}</div>
        {/if}
      </div>
    </section>
  </div>
{/if}

<style>
  .script-diagnostics-overlay {
    position: absolute;
    inset: 10px 8px;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 0.45rem 0.35rem 0;
    background: color-mix(in srgb, var(--bg-base) 42%, transparent);
    backdrop-filter: blur(2px);
    pointer-events: auto;
    z-index: 13;
  }

  .script-diagnostics-panel {
    width: min(48rem, 100%);
    max-height: min(68vh, calc(100% - 0.35rem));
    display: flex;
    flex-direction: column;
    min-height: 0;
    border: 1px solid color-mix(in srgb, var(--state-danger-fg) 22%, var(--border-color));
    border-radius: var(--radius-panel);
    background: var(--bg-elevated);
    box-shadow: var(--shadow-popover);
    backdrop-filter: blur(7px);
    overflow: hidden;
    pointer-events: auto;
  }

  .script-diagnostics-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.55rem 0.7rem;
    border-bottom: 1px solid color-mix(in srgb, var(--state-danger-fg) 12%, var(--border-color));
  }

  .script-diagnostics-header h3 {
    margin: 0;
    font-size: var(--text-base);
    line-height: 1.25;
    color: var(--text-primary);
  }

  .script-diagnostics-header p {
    margin: 0.18rem 0 0;
    font-size: var(--text-xs);
    line-height: 1.35;
    color: var(--text-secondary);
  }

  .script-diagnostics-close {
    flex: none;
    min-width: 3.6rem;
    padding: 0.28rem 0.62rem;
    border: 1px solid color-mix(in srgb, var(--state-danger-fg) 18%, var(--border-color));
    border-radius: var(--control-radius-soft);
    background: color-mix(in srgb, var(--state-danger-fg) 10%, var(--bg-surface));
    color: var(--text-primary);
    cursor: pointer;
    transition: transform 0.16s ease, border-color 0.16s ease, background 0.16s ease;
  }

  .script-diagnostics-close:hover {
    transform: translateY(-1px);
    border-color: var(--state-danger-fg);
    background: color-mix(in srgb, var(--state-danger-fg) 14%, var(--bg-surface-hover));
  }

  .script-diagnostics-list {
    flex: 1;
    min-height: 0;
    display: grid;
    align-content: start;
    gap: 0.42rem;
    padding: 0.62rem 0.72rem 0.72rem;
    overflow: auto;
  }

  .script-diagnostics-item {
    display: grid;
    grid-template-columns: auto auto minmax(0, 1fr);
    align-items: start;
    gap: 0.5rem;
    padding: 0.54rem 0.62rem;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-card);
    background: var(--bg-surface);
    color: inherit;
    text-align: left;
    cursor: pointer;
    transition: transform 0.16s ease, border-color 0.16s ease, background 0.16s ease;
  }

  .script-diagnostics-item:hover,
  .script-diagnostics-item:focus-visible {
    transform: translateY(-1px);
    outline: none;
    border-color: var(--state-danger-fg);
    background: var(--bg-surface-active);
  }

  .script-diagnostics-item.error .script-diagnostics-severity {
    color: var(--state-danger-fg);
    background: color-mix(in srgb, var(--state-danger-fg) 14%, transparent);
  }

  .script-diagnostics-item.warning .script-diagnostics-severity {
    color: var(--state-warning-fg);
    background: color-mix(in srgb, var(--state-warning-fg) 14%, transparent);
  }

  .script-diagnostics-position {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--text-secondary);
    white-space: nowrap;
  }

  .script-diagnostics-severity {
    padding: 0.08rem 0.38rem;
    border-radius: var(--control-radius-pill);
    font-size: var(--text-2xs);
    line-height: 1.35;
    white-space: nowrap;
  }

  .script-diagnostics-message {
    min-width: 0;
    font-size: var(--text-sm);
    line-height: 1.42;
    color: var(--text-primary);
    word-break: break-word;
    white-space: pre-wrap;
  }

  .script-diagnostics-empty {
    padding: 1.4rem 1rem;
    border: 1px dashed var(--border-color);
    border-radius: var(--radius-panel);
    text-align: center;
    color: var(--text-secondary);
  }

  :global([data-theme='light']) .script-diagnostics-overlay {
    background: color-mix(in srgb, var(--bg-base) 30%, transparent);
  }

  :global([data-theme='light']) .script-diagnostics-panel {
    border-color: color-mix(in srgb, var(--state-danger-fg) 18%, var(--border-color));
    background: var(--bg-elevated);
    box-shadow: var(--shadow-popover);
  }

  :global([data-theme='light']) .script-diagnostics-header h3,
  :global([data-theme='light']) .script-diagnostics-message {
    color: var(--text-primary);
  }

  :global([data-theme='light']) .script-diagnostics-header p,
  :global([data-theme='light']) .script-diagnostics-position,
  :global([data-theme='light']) .script-diagnostics-empty {
    color: var(--text-secondary);
  }

  :global([data-theme='light']) .script-diagnostics-close {
    border-color: color-mix(in srgb, var(--state-danger-fg) 18%, var(--border-color));
    background: color-mix(in srgb, var(--state-danger-fg) 10%, var(--bg-surface));
    color: var(--state-danger-fg);
  }

  :global([data-theme='light']) .script-diagnostics-item {
    border-color: var(--border-color);
    background: var(--bg-surface);
  }

  :global([data-theme='light']) .script-diagnostics-item:hover,
  :global([data-theme='light']) .script-diagnostics-item:focus-visible {
    border-color: color-mix(in srgb, var(--state-danger-fg) 24%, var(--border-color));
    background: var(--bg-surface);
  }

  @media (max-width: 720px) {
    .script-diagnostics-overlay {
      inset: 0;
      padding: 0.45rem;
      align-items: stretch;
    }

    .script-diagnostics-panel {
      width: 100%;
      max-height: none;
    }

    .script-diagnostics-item {
      grid-template-columns: auto minmax(0, 1fr);
    }

    .script-diagnostics-message {
      grid-column: 1 / -1;
    }
  }
</style>
