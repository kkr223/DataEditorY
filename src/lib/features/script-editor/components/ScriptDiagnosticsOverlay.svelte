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

  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      onClose();
    }
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
    onclick={handleBackdropClick}
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
    background: rgba(7, 11, 10, 0.42);
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
    border: 1px solid rgba(196, 122, 112, 0.22);
    border-radius: 12px;
    background: linear-gradient(180deg, #1b211e, #111613);
    box-shadow: 0 12px 26px rgba(0, 0, 0, 0.2);
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
    border-bottom: 1px solid rgba(196, 122, 112, 0.12);
  }

  .script-diagnostics-header h3 {
    margin: 0;
    font-size: 0.95rem;
    line-height: 1.25;
    color: #f6faf4;
  }

  .script-diagnostics-header p {
    margin: 0.18rem 0 0;
    font-size: 0.76rem;
    line-height: 1.35;
    color: rgba(220, 231, 221, 0.64);
  }

  .script-diagnostics-close {
    flex: none;
    min-width: 3.6rem;
    padding: 0.28rem 0.62rem;
    border: 1px solid rgba(196, 122, 112, 0.18);
    border-radius: 8px;
    background: #352925;
    color: #fff5f2;
    cursor: pointer;
    transition: transform 0.16s ease, border-color 0.16s ease, background 0.16s ease;
  }

  .script-diagnostics-close:hover {
    transform: translateY(-1px);
    border-color: rgba(229, 171, 137, 0.32);
    background: rgba(70, 49, 44, 0.58);
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
    border: 1px solid rgba(180, 180, 160, 0.12);
    border-radius: 10px;
    background: #1f2924;
    color: inherit;
    text-align: left;
    cursor: pointer;
    transition: transform 0.16s ease, border-color 0.16s ease, background 0.16s ease;
  }

  .script-diagnostics-item:hover,
  .script-diagnostics-item:focus-visible {
    transform: translateY(-1px);
    outline: none;
    border-color: rgba(229, 171, 137, 0.32);
    background: #2b342c;
  }

  .script-diagnostics-item.error .script-diagnostics-severity {
    color: #ffd5cc;
    background: rgba(196, 122, 112, 0.16);
  }

  .script-diagnostics-item.warning .script-diagnostics-severity {
    color: #ffe8b3;
    background: rgba(196, 168, 102, 0.16);
  }

  .script-diagnostics-position {
    font-family: 'Consolas', 'SFMono-Regular', 'Courier New', monospace;
    font-size: 0.78rem;
    color: rgba(234, 239, 231, 0.74);
    white-space: nowrap;
  }

  .script-diagnostics-severity {
    padding: 0.08rem 0.38rem;
    border-radius: 999px;
    font-size: 0.72rem;
    line-height: 1.35;
    white-space: nowrap;
  }

  .script-diagnostics-message {
    min-width: 0;
    font-size: 0.8rem;
    line-height: 1.42;
    color: rgba(238, 244, 235, 0.82);
    word-break: break-word;
    white-space: pre-wrap;
  }

  .script-diagnostics-empty {
    padding: 1.4rem 1rem;
    border: 1px dashed rgba(117, 166, 130, 0.16);
    border-radius: 12px;
    text-align: center;
    color: rgba(217, 235, 220, 0.76);
  }

  :global([data-theme='light']) .script-diagnostics-overlay {
    background: rgba(221, 233, 226, 0.5);
  }

  :global([data-theme='light']) .script-diagnostics-panel {
    border-color: rgba(198, 128, 117, 0.18);
    background: linear-gradient(180deg, #fffefd, #f7faf6);
    box-shadow: 0 12px 28px rgba(73, 94, 78, 0.08);
  }

  :global([data-theme='light']) .script-diagnostics-header h3,
  :global([data-theme='light']) .script-diagnostics-message {
    color: #172b1f;
  }

  :global([data-theme='light']) .script-diagnostics-header p,
  :global([data-theme='light']) .script-diagnostics-position,
  :global([data-theme='light']) .script-diagnostics-empty {
    color: rgba(52, 76, 60, 0.74);
  }

  :global([data-theme='light']) .script-diagnostics-close {
    border-color: rgba(198, 128, 117, 0.18);
    background: #fbefec;
    color: #593127;
  }

  :global([data-theme='light']) .script-diagnostics-item {
    border-color: rgba(111, 150, 118, 0.12);
    background: #ffffff;
  }

  :global([data-theme='light']) .script-diagnostics-item:hover,
  :global([data-theme='light']) .script-diagnostics-item:focus-visible {
    border-color: rgba(198, 128, 117, 0.24);
    background: #fff9f7;
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
