<script lang="ts">
  import type { ScriptWorkspaceState } from '$lib/types';

  let {
    tabs = [] as ScriptWorkspaceState[],
    activeTabId = null as string | null,
    newTabTitle = '',
    closeTabTitle = '',
    canCreate = true,
    onActivate = (_tabId: string) => {},
    onClose = (_tabId: string) => {},
    onNew = () => {},
    getTabTitle = (tab: ScriptWorkspaceState) => tab.cardName,
  } = $props<{
    tabs?: ScriptWorkspaceState[];
    activeTabId?: string | null;
    newTabTitle?: string;
    closeTabTitle?: string;
    canCreate?: boolean;
    onActivate?: (tabId: string) => void;
    onClose?: (tabId: string) => void;
    onNew?: () => void;
    getTabTitle?: (tab: ScriptWorkspaceState) => string;
  }>();

  function handleCloseClick(event: MouseEvent, tabId: string) {
    event.stopPropagation();
    onClose(tabId);
  }

  function handleTabKeydown(event: KeyboardEvent, tabId: string) {
    if (event.key !== 'Delete' || !(event.ctrlKey || event.metaKey)) {
      return;
    }

    event.preventDefault();
    onClose(tabId);
  }
</script>

<div class="script-tab-bar" role="tablist" aria-label="Script tabs">
  <div class="script-tab-list">
    {#each tabs as tab (tab.id)}
      <div
        role="tab"
        class="script-tab"
        class:active={tab.id === activeTabId}
        class:dirty={tab.isDirty}
        aria-selected={tab.id === activeTabId}
        tabindex={tab.id === activeTabId ? 0 : -1}
        title={`${getTabTitle(tab)}${tab.isDirty ? ' •' : ''}`}
        onclick={() => onActivate(tab.id)}
        onkeydown={(event) => handleTabKeydown(event, tab.id)}
      >
        <span class="script-tab-name">{getTabTitle(tab)}</span>
        {#if tab.isDirty}
          <span class="script-tab-dirty" aria-hidden="true"></span>
        {/if}
        <span class="script-tab-close-wrap">
          <button
            type="button"
            class="script-tab-close"
            title={closeTabTitle}
            aria-label={closeTabTitle}
            onclick={(event) => handleCloseClick(event, tab.id)}
          >
            ×
          </button>
        </span>
      </div>
    {/each}
  </div>

  <button
    type="button"
    class="script-tab-new"
    title={newTabTitle}
    aria-label={newTabTitle}
    disabled={!canCreate}
    onclick={onNew}
  >
    +
  </button>
</div>

<style>
  .script-tab-bar {
    display: flex;
    align-items: stretch;
    gap: 6px;
    min-height: 0;
    padding: 6px 8px 0;
    border-bottom: 1px solid color-mix(in srgb, var(--border-color) 88%, transparent);
    background: color-mix(in srgb, var(--bg-surface) 86%, transparent);
  }

  .script-tab-list {
    flex: 1;
    min-width: 0;
    display: flex;
    gap: 6px;
    overflow-x: auto;
    padding-bottom: 6px;
  }

  .script-tab,
  .script-tab-new,
  .script-tab-close {
    font: inherit;
  }

  .script-tab {
    flex: 0 0 auto;
    min-width: 0;
    max-width: min(19rem, 42vw);
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.42rem 0.42rem 0.42rem 0.72rem;
    border: 1px solid color-mix(in srgb, var(--border-color) 92%, transparent);
    border-radius: 10px;
    background: color-mix(in srgb, var(--bg-base) 92%, transparent);
    color: var(--text-secondary);
    transition: border-color 0.16s ease, background 0.16s ease, transform 0.16s ease;
  }

  .script-tab:hover {
    transform: translateY(-1px);
    border-color: color-mix(in srgb, var(--accent-primary) 24%, var(--border-color));
    background: color-mix(in srgb, var(--bg-base) 84%, var(--accent-primary) 6%);
  }

  .script-tab.active {
    border-color: color-mix(in srgb, var(--accent-primary) 42%, var(--border-color));
    background: color-mix(in srgb, var(--bg-base) 80%, var(--accent-primary) 10%);
    color: var(--text-primary);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent-primary) 12%, transparent);
  }

  .script-tab-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.78rem;
    line-height: 1.2;
  }

  .script-tab-dirty {
    flex: none;
    width: 0.45rem;
    height: 0.45rem;
    border-radius: 999px;
    background: #f59e0b;
    box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.18);
  }

  .script-tab-close-wrap {
    flex: none;
    display: inline-flex;
  }

  .script-tab-close,
  .script-tab-new {
    width: 1.5rem;
    height: 1.5rem;
    display: inline-grid;
    place-items: center;
    border-radius: 8px;
    border: 1px solid transparent;
    background: transparent;
    color: inherit;
  }

  .script-tab-close:hover,
  .script-tab-new:hover {
    border-color: color-mix(in srgb, var(--accent-primary) 18%, var(--border-color));
    background: color-mix(in srgb, var(--accent-primary) 10%, transparent);
  }

  .script-tab-new {
    flex: none;
    align-self: flex-start;
    margin-bottom: 6px;
    border-color: color-mix(in srgb, var(--border-color) 92%, transparent);
    background: color-mix(in srgb, var(--bg-base) 92%, transparent);
    color: var(--text-primary);
    font-size: 1rem;
    font-weight: 700;
  }

  .script-tab-new:disabled {
    opacity: 0.48;
    cursor: not-allowed;
    transform: none;
  }
</style>
