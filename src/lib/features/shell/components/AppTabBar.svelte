<script lang="ts">
  import { _ } from 'svelte-i18n';
  import type { CdbTab } from '$lib/stores/db';
  import type { MainView } from '$lib/stores/appShell.svelte';
  import type { ScriptWorkspaceState } from '$lib/types';

  let {
    settingsOpen = false,
    mainView = 'editor',
    tabs = [],
    activeTabId = null,
    scriptTabs = [],
    activeScriptTabId = null,
    getScriptTabDisplayName = (tab: ScriptWorkspaceState) => tab.cardName,
    onOpenSettings = () => {},
    onCloseSettings = () => {},
    onActivateTab = (_tabId: string) => {},
    onCloseTab = async (_tabId: string) => {},
    onActivateScriptTab = (_tabId: string) => {},
    onCloseScriptTab = async (_tabId: string) => {},
    onOpenAnother = async () => {},
  }: {
    settingsOpen?: boolean;
    mainView?: MainView;
    tabs?: CdbTab[];
    activeTabId?: string | null;
    scriptTabs?: ScriptWorkspaceState[];
    activeScriptTabId?: string | null;
    getScriptTabDisplayName?: (tab: ScriptWorkspaceState) => string;
    onOpenSettings?: () => void;
    onCloseSettings?: () => void;
    onActivateTab?: (tabId: string) => void;
    onCloseTab?: (tabId: string) => void | Promise<void>;
    onActivateScriptTab?: (tabId: string) => void;
    onCloseScriptTab?: (tabId: string) => void | Promise<void>;
    onOpenAnother?: () => void | Promise<void>;
  } = $props();
</script>

{#if tabs.length > 0 || scriptTabs.length > 0 || settingsOpen}
  <div class="tab-bar">
    {#if settingsOpen}
      <button
        class="tab-item"
        class:active={mainView === 'settings'}
        onclick={onOpenSettings}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06A2 2 0 1 1 7.04 4.3l.06.06A1.65 1.65 0 0 0 8.92 4a1.65 1.65 0 0 0 1-1.51V2a2 2 0 1 1 4 0v-.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06A2 2 0 1 1 19.63 7l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.44.55.94 1.08 1H21a2 2 0 1 1 0 4h-.09c-.53.06-.94.56-1.08 1z"></path></svg>
        <span class="tab-name">{$_('nav.settings')}</span>
        <span
          class="tab-close"
          role="button"
          tabindex="0"
          onclick={(event) => { event.stopPropagation(); onCloseSettings(); }}
          onkeydown={(event) => { if (event.key === 'Enter') { event.stopPropagation(); onCloseSettings(); } }}
        >×</span>
      </button>
    {/if}
    {#each tabs as tab (tab.id)}
      <button
        class="tab-item"
        class:active={activeTabId === tab.id}
        onclick={() => onActivateTab(tab.id)}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg>
        <span class="tab-name">{tab.name}</span>
        {#if tab.isDirty}
          <span class="tab-dirty" aria-label={$_('editor.unsaved_badge')} title={$_('editor.unsaved_badge')}>•</span>
        {/if}
        <span
          class="tab-close"
          role="button"
          tabindex="0"
          onclick={(event) => { event.stopPropagation(); void onCloseTab(tab.id); }}
          onkeydown={(event) => { if (event.key === 'Enter') { event.stopPropagation(); void onCloseTab(tab.id); } }}
        >×</span>
      </button>
    {/each}
    {#each scriptTabs as tab (tab.id)}
      <button
        class="tab-item script-tab"
        class:active={activeScriptTabId === tab.id && mainView === 'script'}
        onclick={() => onActivateScriptTab(tab.id)}
        title={tab.scriptPath}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><path d="M14 2v6h6"></path><path d="M10 13h4"></path><path d="M10 17h4"></path><path d="M8 9h1"></path></svg>
        <span class="tab-name">{getScriptTabDisplayName(tab)}</span>
        {#if tab.isDirty}
          <span class="tab-dirty" aria-label={$_('editor.unsaved_badge')} title={$_('editor.unsaved_badge')}>•</span>
        {/if}
        <span
          class="tab-close"
          role="button"
          tabindex="0"
          onclick={(event) => { event.stopPropagation(); void onCloseScriptTab(tab.id); }}
          onkeydown={(event) => { if (event.key === 'Enter') { event.stopPropagation(); void onCloseScriptTab(tab.id); } }}
        >×</span>
      </button>
    {/each}
    <button class="tab-add" onclick={onOpenAnother} title="Open another CDB">
      +
    </button>
  </div>
{/if}

<style>
  .tab-bar {
    --tab-radius: 12px;
    --tab-surface: color-mix(in srgb, var(--bg-surface-hover) 72%, var(--bg-surface));
    --tab-surface-hover: color-mix(in srgb, var(--bg-surface-hover) 92%, var(--bg-surface));
    --tab-surface-active: color-mix(in srgb, var(--bg-base) 82%, var(--bg-surface));
    display: flex;
    align-items: stretch;
    gap: 0;
    padding: 4px 10px 0;
    background: color-mix(in srgb, var(--bg-surface) 90%, var(--bg-base));
    overflow-x: auto;
    flex-shrink: 0;
    position: relative;
    scrollbar-width: none;
  }

  .tab-bar::-webkit-scrollbar {
    display: none;
  }

  .tab-bar::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 1px;
    background: color-mix(in srgb, var(--border-color) 82%, transparent);
  }

  .tab-item,
  .tab-add {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    margin-right: 3px;
    padding: 5px 12px 6px;
    border: 1px solid transparent;
    border-bottom: none;
    border-radius: var(--tab-radius) var(--tab-radius) 0 0;
    background: var(--tab-surface);
    color: var(--text-secondary);
    cursor: pointer;
    transition:
      background-color 0.18s ease,
      color 0.18s ease,
      border-color 0.18s ease,
      transform 0.18s ease,
      box-shadow 0.18s ease;
    font: inherit;
    transform: translateY(2px);
    box-shadow: none;
  }

  .tab-item::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.04) 0%, rgba(255, 255, 255, 0.01) 100%);
    pointer-events: none;
    opacity: 0.55;
  }

  .tab-item:hover,
  .tab-add:hover {
    color: var(--text-primary);
    background: var(--tab-surface-hover);
    transform: translateY(0);
  }

  .tab-item.active {
    color: var(--text-primary);
    background: var(--tab-surface-active);
    border-color: color-mix(in srgb, var(--border-color) 92%, rgba(255, 255, 255, 0.12));
    transform: translateY(0);
    z-index: 2;
    box-shadow: none;
  }

  .tab-item.active::after {
    content: '';
    position: absolute;
    left: 12px;
    right: 12px;
    bottom: -1px;
    height: 1px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--bg-base) 96%, white 4%);
  }

  .script-tab.active {
    background: color-mix(in srgb, var(--accent-primary) 10%, var(--tab-surface-active));
  }

  .tab-item svg {
    flex-shrink: 0;
    opacity: 0.78;
  }

  .tab-item.active svg {
    opacity: 0.96;
  }

  .tab-name {
    max-width: 188px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    position: relative;
    z-index: 1;
    font-weight: 600;
    line-height: 1.1;
  }

  .tab-dirty {
    color: color-mix(in srgb, var(--accent-primary) 88%, white 12%);
    font-size: 0.95rem;
    line-height: 1;
    position: relative;
    z-index: 1;
  }

  .tab-close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 17px;
    height: 17px;
    border-radius: 999px;
    color: inherit;
    opacity: 0.68;
    position: relative;
    z-index: 1;
    transition: background-color 0.16s ease, opacity 0.16s ease, transform 0.16s ease;
  }

  .tab-close:hover {
    background: color-mix(in srgb, var(--bg-surface-hover) 78%, transparent);
    opacity: 1;
    transform: none;
  }

  .tab-add {
    align-self: flex-start;
    min-width: 28px;
    min-height: 28px;
    margin-left: 3px;
    margin-right: 0;
    padding: 0;
    justify-content: center;
    font-size: 1.08rem;
    font-weight: 600;
    line-height: 1;
    border-radius: 999px;
    border: 1px solid transparent;
    background: transparent;
    color: color-mix(in srgb, var(--text-secondary) 92%, white 8%);
    transform: translateY(2px);
    box-shadow: none;
  }

  .tab-add:hover {
    transform: translateY(0);
    background: color-mix(in srgb, var(--bg-surface-hover) 88%, transparent);
    border-color: color-mix(in srgb, var(--border-color) 72%, transparent);
    color: var(--text-primary);
  }

  .tab-add:active {
    transform: translateY(0) scale(0.98);
  }

  .tab-item:focus-visible,
  .tab-add:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent-primary) 35%, transparent);
  }
</style>
