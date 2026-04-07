<script lang="ts">
  import { tick } from 'svelte';
  import type { LuaReferenceManualItem, LuaReferenceManualKind } from '$lib/utils/luaScriptMonaco';

  export let open = false;
  export let kind: LuaReferenceManualKind = 'constants';
  export let title = '';
  export let shortcutHint = '';
  export let searchPlaceholder = '';
  export let emptyText = '';
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
    if (event.key === 'Escape') {
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
    <section class="script-reference-panel">
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
        {#if filteredItems.length > 0}
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
    border: 1px solid rgba(117, 166, 130, 0.2);
    border-radius: 12px;
    background: linear-gradient(180deg, rgba(20, 27, 24, 0.74), rgba(15, 20, 18, 0.68));
    box-shadow: 0 12px 26px rgba(0, 0, 0, 0.18);
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
    border-bottom: 1px solid rgba(117, 166, 130, 0.1);
  }

  .script-reference-shortcut {
    margin: 0;
    font-size: 0.76rem;
    line-height: 1.3;
    color: rgba(214, 229, 218, 0.62);
  }

  .script-reference-close {
    flex: none;
    min-width: 3.6rem;
    padding: 0.28rem 0.62rem;
    border: 1px solid rgba(117, 166, 130, 0.16);
    border-radius: 8px;
    background: rgba(41, 56, 49, 0.42);
    color: #eff8f1;
    cursor: pointer;
    transition: transform 0.16s ease, border-color 0.16s ease, background 0.16s ease;
  }

  .script-reference-close:hover {
    transform: translateY(-1px);
    border-color: rgba(141, 192, 155, 0.28);
    background: rgba(50, 67, 59, 0.58);
  }

  .script-reference-search-row {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    padding: 0.4rem 0.62rem 0.44rem;
    border-bottom: 1px solid rgba(117, 166, 130, 0.08);
  }

  .script-reference-search {
    flex: 1;
    min-width: 0;
    padding: 0.46rem 0.7rem;
    border: 1px solid rgba(117, 166, 130, 0.18);
    border-radius: 8px;
    background: rgba(8, 14, 12, 0.4);
    color: #f2fbf4;
    outline: none;
  }

  .script-reference-search:focus {
    border-color: rgba(122, 211, 153, 0.34);
    box-shadow: 0 0 0 2px rgba(76, 162, 111, 0.14);
  }

  .script-reference-count {
    flex: none;
    font-size: 0.76rem;
    color: rgba(210, 226, 214, 0.54);
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
    border: 1px solid rgba(117, 166, 130, 0.12);
    border-radius: 10px;
    background: linear-gradient(180deg, rgba(31, 42, 38, 0.46), rgba(20, 27, 24, 0.38));
    color: inherit;
    text-align: left;
    cursor: pointer;
    transition: transform 0.16s ease, border-color 0.16s ease, background 0.16s ease;
  }

  .script-reference-item:hover {
    transform: translateY(-1px);
    border-color: rgba(136, 198, 154, 0.26);
    background: linear-gradient(180deg, rgba(37, 50, 44, 0.62), rgba(24, 33, 29, 0.54));
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
    align-items: center;
    gap: 0.55rem;
    min-width: 0;
  }

  .script-reference-item-title,
  .script-reference-item-detail,
  .script-reference-item-value {
    font-family: 'Consolas', 'SFMono-Regular', 'Courier New', monospace;
  }

  .script-reference-item-title {
    font-size: 0.88rem;
    line-height: 1.32;
    color: #edf8ef;
    word-break: break-word;
  }

  .script-reference-item-value {
    flex: none;
    font-size: 0.82rem;
    line-height: 1.32;
    color: rgba(202, 231, 210, 0.84);
    white-space: nowrap;
  }

  .script-reference-item-category {
    flex: none;
    padding: 0.14rem 0.46rem;
    border-radius: 999px;
    background: rgba(110, 195, 137, 0.12);
    color: rgba(209, 239, 216, 0.72);
    font-size: 0.72rem;
    line-height: 1.3;
  }

  .script-reference-item-detail {
    min-width: 0;
    flex: 1;
    font-size: 0.76rem;
    line-height: 1.38;
    color: rgba(196, 219, 202, 0.78);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    word-break: break-word;
  }

  .script-reference-item-description {
    font-size: 0.78rem;
    line-height: 1.42;
    color: rgba(214, 230, 218, 0.66);
    white-space: pre-wrap;
    word-break: break-word;
  }

  .script-reference-item.functions {
    padding-top: 0.52rem;
    padding-bottom: 0.52rem;
  }

  .script-reference-item.functions .script-reference-item-title {
    flex: none;
    min-width: 11rem;
  }

  .script-reference-item.functions .script-reference-item-category {
    max-width: 14rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
    border: 1px dashed rgba(117, 166, 130, 0.14);
    border-radius: 12px;
    text-align: center;
    color: rgba(214, 230, 218, 0.7);
  }

  :global([data-theme='light']) .script-reference-overlay {
    background: rgba(221, 233, 226, 0.12);
  }

  :global([data-theme='light']) .script-reference-panel {
    border-color: rgba(106, 154, 116, 0.14);
    background: linear-gradient(180deg, rgba(253, 255, 253, 0.74), rgba(243, 248, 244, 0.68));
    box-shadow: 0 12px 28px rgba(73, 94, 78, 0.08);
  }

  :global([data-theme='light']) .script-reference-shortcut,
  :global([data-theme='light']) .script-reference-count,
  :global([data-theme='light']) .script-reference-item-description,
  :global([data-theme='light']) .script-reference-empty {
    color: rgba(58, 87, 67, 0.72);
  }

  :global([data-theme='light']) .script-reference-close {
    border-color: rgba(104, 150, 113, 0.16);
    background: rgba(235, 244, 237, 0.5);
    color: #1f3f2d;
  }

  :global([data-theme='light']) .script-reference-close:hover {
    border-color: rgba(104, 150, 113, 0.24);
    background: rgba(243, 249, 244, 0.76);
  }

  :global([data-theme='light']) .script-reference-search {
    border-color: rgba(104, 150, 113, 0.14);
    background: rgba(255, 255, 255, 0.54);
    color: #173023;
  }

  :global([data-theme='light']) .script-reference-item {
    border-color: rgba(104, 150, 113, 0.1);
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.58), rgba(244, 249, 245, 0.46));
  }

  :global([data-theme='light']) .script-reference-item:hover {
    border-color: rgba(104, 150, 113, 0.18);
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.76), rgba(238, 246, 240, 0.68));
  }

  :global([data-theme='light']) .script-reference-item-title {
    color: #173023;
  }

  :global([data-theme='light']) .script-reference-item-category {
    background: rgba(72, 159, 99, 0.08);
    color: rgba(34, 88, 47, 0.76);
  }

  :global([data-theme='light']) .script-reference-item-detail {
    color: rgba(40, 70, 49, 0.74);
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
