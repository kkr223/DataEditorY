<script lang="ts">
  import { openContextMenu as showMenu, updateContextMenu, type ContextMenuItem } from '$lib/features/context-menu/menu.svelte';
  import { getTabsToClose } from '$lib/features/context-menu/cardTargets';
  import { pathExists, revealFile } from '$lib/native/assetApi';
  import { _ } from 'svelte-i18n';
  import type { WorkspaceDocument } from '$lib/core/workspace/types';
  import { tabDrag } from '$lib/components/tabDrag';
  import type { DocumentPlacement } from '$lib/platform/runtime';

  let {
    workspaces = [],
    activeWorkspaceId = null,
    onActivateWorkspace,
    onMoveWorkspace,
    onSaveWorkspace,
    onSaveWorkspaceAs,
    onCloseWorkspace,
    onOpenAnother,
  }: {
    workspaces?: WorkspaceDocument[];
    activeWorkspaceId?: string | null;
    onActivateWorkspace: (tabId: string) => void;
    onMoveWorkspace: (tabId: string, targetId: string, placement: DocumentPlacement) => void;
    onSaveWorkspace: (tabId: string) => unknown | Promise<unknown>;
    onSaveWorkspaceAs: (tabId: string) => unknown | Promise<unknown>;
    onCloseWorkspace: (tabId: string) => unknown | Promise<unknown>;
    onOpenAnother: () => void | Promise<void>;
  } = $props();

  function getWorkspaceIcon(workspace: WorkspaceDocument) {
    if (workspace.kind === 'settings') {
      return 'settings';
    }

    if (workspace.kind === 'script') {
      return 'script';
    }

    if (workspace.kind === 'card-image') {
      return 'image';
    }

    if (workspace.kind === 'text') {
      return 'text';
    }

    return 'db';
  }

  function getWorkspaceTitle(workspace: WorkspaceDocument) {
    return workspace.kind === 'settings' ? $_('nav.settings') : workspace.title;
  }

  function getWorkspaceSubtitle(workspace: WorkspaceDocument) {
    return workspace.kind === 'settings' ? $_('settings.title') : workspace.subtitle;
  }

  function openContextMenu(event: MouseEvent, workspace: WorkspaceDocument) {
    const t = (key: string) => String($_(`context_menu.${key}`));
    const path = workspace.source.path;
    let exists = false;
    const others = getTabsToClose(workspaces, workspace.id, 'others');
    const right = getTabsToClose(workspaces, workspace.id, 'right');
    const closeMany = async (targets: WorkspaceDocument[]) => {
      for (const target of targets) {
        if (await onCloseWorkspace(target.id) === false) break;
      }
    };
    const items = (): ContextMenuItem[] => [
      { id: 'save', label: workspace.kind === 'db' ? t('save_database') : $_('nav.save'), disabled: workspace.kind === 'settings', action: () => onSaveWorkspace(workspace.id) },
      { id: 'save-as', label: t('save_as'), disabled: workspace.kind !== 'db' && workspace.kind !== 'text', action: () => onSaveWorkspaceAs(workspace.id) },
      ...(workspace.kind === 'db' ? [null,
        { id: 'copy-path', label: t('copy_path'), disabled: !path, action: () => navigator.clipboard.writeText(path ?? '') },
        { id: 'reveal', label: t('reveal_database'), disabled: !exists, action: () => path && revealFile(path) },
      ] : []), null,
      { id: 'close', label: workspace.kind === 'db' ? t('close_database') : $_('nav.close'), action: () => onCloseWorkspace(workspace.id) },
      ...(workspace.kind === 'db' ? [
        { id: 'close-others', label: t('close_other_databases'), disabled: !others.length, action: () => closeMany(others) },
        { id: 'close-right', label: t('close_right_databases'), disabled: !right.length, action: () => closeMany(right) },
      ] : []),
    ];
    const token = showMenu(event, items());
    if (path) void pathExists(path).then((value) => { exists = value; updateContextMenu(token, items()); }).catch(() => {});
  }
</script>



{#if workspaces.length > 0}
  <div class="tab-bar">
    {#each workspaces as workspace (workspace.id)}
      <button
        class="tab-item"
        use:tabDrag={{ id: workspace.id, scope: 'cdb', enabled: workspace.kind === 'db', onMove: onMoveWorkspace }}
        class:active={activeWorkspaceId === workspace.id}
        class:script-tab={workspace.kind === 'script'}
        onclick={() => onActivateWorkspace(workspace.id)}
        onmousedown={(event) => { if (event.button === 1) event.preventDefault(); }}
        onauxclick={(event) => { if (event.button === 1) { event.preventDefault(); void onCloseWorkspace(workspace.id); } }}
        oncontextmenu={(event) => openContextMenu(event, workspace)}
        title={getWorkspaceSubtitle(workspace)}
      >
        {#if getWorkspaceIcon(workspace) === 'settings'}
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06A2 2 0 1 1 7.04 4.3l.06.06A1.65 1.65 0 0 0 8.92 4a1.65 1.65 0 0 0 1-1.51V2a2 2 0 1 1 4 0v-.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06A2 2 0 1 1 19.63 7l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.44.55.94 1.08 1H21a2 2 0 1 1 0 4h-.09c-.53.06-.94.56-1.08 1z"></path></svg>
        {:else if getWorkspaceIcon(workspace) === 'script'}
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><path d="M14 2v6h6"></path><path d="M10 13h4"></path><path d="M10 17h4"></path><path d="M8 9h1"></path></svg>
        {:else if getWorkspaceIcon(workspace) === 'image'}
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><path d="M21 15l-5-5L5 21"></path></svg>
        {:else if getWorkspaceIcon(workspace) === 'text'}
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><path d="M14 2v6h6"></path><line x1="8" y1="13" x2="16" y2="13"></line><line x1="8" y1="17" x2="13" y2="17"></line></svg>
        {:else}
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg>
        {/if}
        <span class="tab-name">{getWorkspaceTitle(workspace)}</span>
        {#if workspace.dirty}
          <span class="tab-dirty" aria-label={$_('editor.unsaved_badge')} title={$_('editor.unsaved_badge')}>•</span>
        {/if}
        <span
          class="tab-close"
          data-tab-close
          role="button"
          tabindex="0"
          onclick={(event) => { event.stopPropagation(); void onCloseWorkspace(workspace.id); }}
          onkeydown={(event) => { if (event.key === 'Enter') { event.stopPropagation(); void onCloseWorkspace(workspace.id); } }}
        >×</span>
      </button>
    {/each}
    <button class="tab-add" onclick={onOpenAnother} title={$_('nav.open_another_cdb')}>
      +
    </button>


  </div>
{/if}

<style>
  .tab-bar {
    --tab-radius: var(--border-radius-lg);
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
    background: var(--interactive-hover-border);
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

  .tab-item {
    flex-shrink: 0;
    user-select: none;
    touch-action: pan-y;
  }

  .tab-item:global([data-tab-dragging]) { opacity: 0.45; cursor: grabbing; }

  .tab-item:hover,
  .tab-add:hover {
    color: var(--text-primary);
    background: var(--tab-surface-hover);
    transform: translateY(0);
  }

  .tab-item.active {
    color: var(--text-primary);
    background: var(--tab-surface-active);
    border-color: var(--interactive-hover-border);
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
    border-radius: var(--control-radius-pill);
    background: color-mix(in srgb, var(--bg-base) 96%, white 4%);
  }

  .tab-item:global([data-tab-drop='before']) { box-shadow: inset 3px 0 var(--accent-primary); }
  .tab-item:global([data-tab-drop='after']) { box-shadow: inset -3px 0 var(--accent-primary); }

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
    font-size: var(--text-base);
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
    border-radius: var(--control-radius-pill);
    color: inherit;
    opacity: 0.68;
    position: relative;
    z-index: 1;
    transition: background-color 0.16s ease, opacity 0.16s ease, transform 0.16s ease;
  }

  .tab-close:hover {
    background: var(--interactive-soft-bg);
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
    font-size: var(--text-lg);
    font-weight: 600;
    line-height: 1;
    border-radius: var(--control-radius-pill);
    border: 1px solid transparent;
    background: transparent;
    color: var(--text-secondary);
    transform: translateY(2px);
    box-shadow: none;
  }

  .tab-add:hover {
    transform: translateY(0);
    background: var(--interactive-soft-bg);
    border-color: var(--interactive-soft-border);
    color: var(--text-primary);
  }

  .tab-add:active {
    transform: translateY(0) scale(0.98);
  }

  .tab-item:focus-visible,
  .tab-add:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring-strong);
  }


</style>
