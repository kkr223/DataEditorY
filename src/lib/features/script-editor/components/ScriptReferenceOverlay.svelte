<script lang="ts">
  import { tick } from 'svelte';
  import { disableAutofill } from '$lib/actions/disableAutofill';
  import { appSettingsState } from '$lib/stores/appSettings.svelte';
  import { isShortcutEvent } from '$lib/features/shortcuts/registry';
  import type { LuaReferenceManualItem, LuaReferenceManualKind } from '$lib/features/script-editor/lua/reference';

  export let open = false;
  export let kind: LuaReferenceManualKind = 'constants';
  export let title = '';
  export let shortcutHint = '';
  export let searchPlaceholder = '';
  export let emptyText = '';
  export let loading = false;
  export let loadingText = '';
  export let closeLabel = '';
  export let items: LuaReferenceManualItem[] = [];
  export let onClose: () => void = () => {};
  export let onInsert: (item: LuaReferenceManualItem) => void = () => {};

  let query = '';
  let searchInput: HTMLInputElement | null = null;
  let lastOpen = false;
  let filteredItems: LuaReferenceManualItem[] = [];

  $: filteredItems = query.trim()
    ? items.filter((item) => item.searchText.includes(query.trim().toLowerCase()))
    : items;

  $: if (open !== lastOpen) {
    if (open) {
      void tick().then(() => {
        searchInput?.focus();
        searchInput?.select();
      });
    } else {
      query = '';
    }
    lastOpen = open;
  }

  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  function handleBackdropKeydown(event: KeyboardEvent) {
    if (isShortcutEvent('scriptEditor.closeReference', event, appSettingsState.values.shortcutBindings)) {
      event.preventDefault();
      onClose();
    }
  }

  function handleInsertClick(item: LuaReferenceManualItem) {
    onInsert(item);
  }
</script>

{#if open}
  <div
    class="script-reference-overlay"
    role="dialog"
    aria-modal="false"
    aria-label={title}
    tabindex="-1"
    onclick={handleBackdropClick}
    onkeydown={handleBackdropKeydown}
  >
    <section class="script-reference-panel" use:disableAutofill>
      <header class="script-reference-header">
        {#if shortcutHint}
          <p class="script-reference-shortcut">{shortcutHint}</p>
        {:else}
          <span></span>
        {/if}
        <button type="button" class="script-reference-close" onclick={onClose}>{closeLabel}</button>
      </header>

      <div class="script-reference-search-row">
        <input
          bind:this={searchInput}
          bind:value={query}
          type="search"
          class="script-reference-search"
          placeholder={searchPlaceholder}
        />
        <span class="script-reference-count">{filteredItems.length} / {items.length}</span>
      </div>

      <div
        class="script-reference-list"
        class:constants-list={kind === 'constants'}
        class:functions-list={kind === 'functions'}
      >
        {#if loading}
          <div class="script-reference-empty">{loadingText}</div>
        {:else if filteredItems.length > 0}
          {#each filteredItems as item (item.key)}
            <button
              type="button"
              class="script-reference-item"
              class:constants={kind === 'constants'}
              class:functions={kind === 'functions'}
              onclick={() => handleInsertClick(item)}
            >
              {#if kind === 'constants'}
                <div class="script-reference-item-top">
                  <span class="script-reference-item-title">{item.title}</span>
                  <span class="script-reference-item-value">{item.valueText}</span>
                </div>
                <div class="script-reference-item-description">{item.description}</div>
                <div class="script-reference-item-bottom">
                  <span class="script-reference-item-category">{item.category}</span>
                </div>
              {:else}
                <div class="script-reference-function-row">
                  <span class="script-reference-item-title">{item.title}</span>
                  <span class="script-reference-item-detail">{item.detail}</span>
                  <span class="script-reference-item-category">{item.category}</span>
                </div>
                <div class="script-reference-item-description functions-description">{item.description}</div>
              {/if}
            </button>
          {/each}
        {:else}
          <div class="script-reference-empty">{emptyText}</div>
        {/if}
      </div>
    </section>
  </div>
{/if}

<style>
  .script-reference-overlay {
    position: absolute;
    inset: 10px 8px 10px 8px;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 0.45rem 0.35rem 0;
    background: rgba(7, 11, 10, 0.08);
    backdrop-filter: blur(1.5px);
    pointer-events: none;
    z-index: 12;
  }

  .script-reference-panel {
    width: min(72rem, 100%);
    display: flex;
    flex-direction: column;
    min-height: 0;
    max-height: min(72vh, calc(100% - 0.35rem));
    border: 1px solid var(--border-color);
    border-radius: var(--radius-panel);
    background: color-mix(in srgb, var(--bg-elevated) 94%, transparent);
    box-shadow: var(--shadow-popover);
    backdrop-filter: blur(7px);
    overflow: hidden;
    pointer-events: auto;
  }

  .script-reference-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.34rem 0.62rem 0.28rem;
    border-bottom: 1px solid var(--border-color);
  }

  .script-reference-shortcut {
    margin: 0;
    font-size: var(--text-xs);
    line-height: 1.3;
    color: var(--text-secondary);
  }

  .script-reference-close {
    flex: none;
    min-width: 3.6rem;
    padding: 0.28rem 0.62rem;
    border: 1px solid var(--border-color);
    border-radius: var(--control-radius-soft);
    background: var(--bg-surface-active);
    color: var(--text-primary);
    cursor: pointer;
    transition: transform 0.16s ease, border-color 0.16s ease, background 0.16s ease;
  }

  .script-reference-close:hover {
    transform: translateY(-1px);
    border-color: var(--accent-primary);
    background: var(--bg-surface-hover);
  }

  .script-reference-search-row {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    padding: 0.4rem 0.62rem 0.44rem;
    border-bottom: 1px solid var(--border-color);
  }

  .script-reference-search {
    flex: 1;
    min-width: 0;
    padding: 0.46rem 0.7rem;
    border: 1px solid var(--border-color);
    border-radius: var(--control-radius-soft);
    background: var(--bg-base);
    color: var(--text-primary);
    outline: none;
  }

  .script-reference-search:focus {
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent-primary) 18%, transparent);
  }

  .script-reference-count {
    flex: none;
    font-size: var(--text-xs);
    color: var(--text-secondary);
  }

  .script-reference-list {
    flex: 1;
    min-height: 0;
    padding: 0.52rem 0.78rem 0.78rem;
    overflow: auto;
    display: grid;
    gap: 0.55rem;
    align-content: start;
  }

  .script-reference-list.constants-list {
    grid-template-columns: repeat(auto-fit, minmax(23rem, 1fr));
  }

  .script-reference-list.functions-list {
    grid-template-columns: 1fr;
  }

  .script-reference-item {
    display: grid;
    gap: 0.28rem;
    padding: 0.62rem 0.74rem 0.58rem;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-card);
    background: var(--bg-surface);
    color: inherit;
    text-align: left;
    cursor: pointer;
    transition: transform 0.16s ease, border-color 0.16s ease, background 0.16s ease;
  }

  .script-reference-item:hover {
    transform: translateY(-1px);
    border-color: var(--accent-primary);
    background: var(--bg-surface-hover);
  }

  .script-reference-item-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.8rem;
  }

  .script-reference-item-bottom,
  .script-reference-function-row {
    display: flex;
    align-items: flex-start;
    flex-wrap: wrap;
    gap: 0.55rem;
    min-width: 0;
  }

  .script-reference-item-title,
  .script-reference-item-detail,
  .script-reference-item-value {
    font-family: var(--font-mono);
  }

  .script-reference-item-title {
    font-size: var(--text-base);
    line-height: 1.32;
    color: var(--text-primary);
    word-break: break-word;
  }

  .script-reference-item-value {
    flex: none;
    font-size: var(--text-sm);
    line-height: 1.32;
    color: var(--text-secondary);
    white-space: nowrap;
  }

  .script-reference-item-category {
    flex: none;
    padding: 0.14rem 0.46rem;
    border-radius: var(--control-radius-pill);
    background: color-mix(in srgb, var(--feature-script-accent) 14%, transparent);
    color: var(--feature-script-accent);
    font-size: var(--text-2xs);
    line-height: 1.3;
  }

  .script-reference-item-detail {
    min-width: 0;
    flex: 1;
    font-size: var(--text-xs);
    line-height: 1.38;
    color: var(--text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    word-break: break-word;
  }

  .script-reference-item-description {
    font-size: var(--text-xs);
    line-height: 1.42;
    color: var(--text-secondary);
    white-space: pre-wrap;
    word-break: break-word;
  }

  .script-reference-item.functions {
    padding-top: 0.52rem;
    padding-bottom: 0.52rem;
  }

  .script-reference-item.functions .script-reference-item-title {
    flex: 0 1 11rem;
    min-width: 0;
  }

  .script-reference-item.functions .script-reference-item-category {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: normal;
  }

  .functions-description {
    display: block;
    line-clamp: unset;
    -webkit-line-clamp: unset;
    -webkit-box-orient: initial;
    overflow: visible;
  }

  .script-reference-empty {
    grid-column: 1 / -1;
    padding: 1.4rem 1rem;
    border: 1px dashed var(--border-color);
    border-radius: var(--radius-panel);
    text-align: center;
    color: var(--text-secondary);
  }

  :global([data-theme='light']) .script-reference-overlay {
    background: color-mix(in srgb, var(--bg-base) 30%, transparent);
  }

  :global([data-theme='light']) .script-reference-panel {
    border-color: var(--border-color);
    background: color-mix(in srgb, var(--bg-elevated) 96%, transparent);
    box-shadow: var(--shadow-popover);
  }

  :global([data-theme='light']) .script-reference-shortcut,
  :global([data-theme='light']) .script-reference-count,
  :global([data-theme='light']) .script-reference-item-description,
  :global([data-theme='light']) .script-reference-empty {
    color: var(--text-secondary);
  }

  :global([data-theme='light']) .script-reference-close {
    border-color: var(--border-color);
    background: var(--bg-surface-active);
    color: var(--text-primary);
  }

  :global([data-theme='light']) .script-reference-close:hover {
    border-color: var(--accent-primary);
    background: var(--bg-surface-hover);
  }

  :global([data-theme='light']) .script-reference-search {
    border-color: var(--border-color);
    background: var(--bg-base);
    color: var(--text-primary);
  }

  :global([data-theme='light']) .script-reference-item {
    border-color: var(--border-color);
    background: var(--bg-surface);
  }

  :global([data-theme='light']) .script-reference-item:hover {
    border-color: var(--accent-primary);
    background: var(--bg-surface-hover);
  }

  :global([data-theme='light']) .script-reference-item-title {
    color: var(--text-primary);
  }

  :global([data-theme='light']) .script-reference-item-category {
    background: color-mix(in srgb, var(--feature-script-accent) 12%, transparent);
    color: var(--feature-script-accent);
  }

  :global([data-theme='light']) .script-reference-item-detail {
    color: var(--text-secondary);
  }

  @media (max-width: 920px) {
    .script-reference-overlay {
      inset: 0;
      padding: 0.45rem;
      align-items: stretch;
    }

    .script-reference-panel {
      width: 100%;
      max-height: none;
    }

    .script-reference-header,
    .script-reference-search-row,
    .script-reference-list {
      padding-left: 0.65rem;
      padding-right: 0.65rem;
    }

    .script-reference-list {
      grid-template-columns: 1fr !important;
    }

    .script-reference-function-row {
      flex-wrap: wrap;
      align-items: flex-start;
    }

    .script-reference-item.functions .script-reference-item-title {
      min-width: 0;
    }
  }
</style>
