<script lang="ts">
  import type { Component } from 'svelte';
  import CardList from '$lib/components/CardList.svelte';
  import CardEditor from '$lib/components/CardEditor.svelte';
  import { activeTab } from '$lib/stores/db';
  import {
    editorState,
    handleSearch,
    setAllCards,
    setSelectedCards,
    setTotalCards,
  } from '$lib/stores/editor.svelte';
  import { DEFAULT_SEARCH_FILTERS } from '$lib/types';
  import { createCdbEditorSnapshot } from '$lib/core/workspace/cdbEditorSnapshot';
  import CardSurfaceRail from '$lib/modules/card/workbench/CardSurfaceRail.svelte';
  import ScriptSurface from '$lib/modules/card/workbench/ScriptSurface.svelte';
  import {
    cardSurfaceState,
    type CardSurfaceId,
  } from '$lib/modules/card/workbench/surfaceState.svelte';
  import { documentRuntime } from '$lib/platform/appRuntime';
  import {
    getCardExplorerState,
    getCardWorkspaceUi,
    loadWorkspaceMetadataForPath,
    setCardExplorerState,
    setCardWorkspaceUi,
    workspaceMetadataState,
  } from '$lib/modules/card/workbench/workspaceMetadataState.svelte';

  const focusMode = $derived(cardSurfaceState.activeSurface !== 'card');
  const extensionSurfaces: Array<{
    surfaceId: Extract<CardSurfaceId, 'image' | 'ai'>;
    contribution: ReturnType<typeof documentRuntime.registry.findWorkbenchContributions>[number];
  }> = documentRuntime.registry
    .findWorkbenchContributions('card.workbench', 'surface')
    .flatMap((contribution) => {
      const surfaceId = contribution.metadata?.surfaceId;
      return surfaceId === 'image' || surfaceId === 'ai'
        ? [{ surfaceId, contribution }]
        : [];
    });
  const SURFACE_IDS = new Set<CardSurfaceId>([
    'card',
    'script',
    ...extensionSurfaces.map(({ surfaceId }) => surfaceId),
  ]);
  let appliedMetadataPath = '';
  let requestedMetadataPath = '';
  let hydratedTabId = '';
  let lastPersistedUiKey = '';
  let lastPersistedExplorerKey = '';
  let loadedExtensionSurface = $state<{
    id: CardSurfaceId;
    component: Component;
  } | null>(null);
  let extensionSurfaceError = $state('');
  let extensionLoadSequence = 0;

  $effect(() => {
    const surfaceId = cardSurfaceState.activeSurface;
    const descriptor = extensionSurfaces.find((entry) => entry.surfaceId === surfaceId)?.contribution;
    if (!descriptor) {
      loadedExtensionSurface = null;
      extensionSurfaceError = '';
      return;
    }
    if (loadedExtensionSurface?.id === surfaceId) return;

    const sequence = ++extensionLoadSequence;
    extensionSurfaceError = '';
    void descriptor.component()
      .then((module) => {
        if (sequence !== extensionLoadSequence || cardSurfaceState.activeSurface !== surfaceId) return;
        loadedExtensionSurface = {
          id: surfaceId,
          component: (module as { default: Component }).default,
        };
      })
      .catch((error) => {
        if (sequence !== extensionLoadSequence) return;
        extensionSurfaceError = error instanceof Error ? error.message : String(error);
      });
  });

  $effect(() => {
    const tab = $activeTab;
    const nextTabId = tab?.id ?? '';
    if (nextTabId === hydratedTabId) return;

    hydratedTabId = nextTabId;
    if (!tab) {
      setAllCards([]);
      setTotalCards(0);
      return;
    }

    const snapshot = createCdbEditorSnapshot(tab);
    editorState.searchFilters = snapshot.filters;
    editorState.currentPage = snapshot.page;
    setAllCards(snapshot.cards);
    setTotalCards(snapshot.total);
    setSelectedCards(
      snapshot.selectedIds,
      snapshot.selectedId,
      snapshot.selectionAnchorId,
    );
  });

  $effect(() => {
    const path = $activeTab?.path ?? '';
    if (path === requestedMetadataPath) return;

    requestedMetadataPath = path;
    appliedMetadataPath = '';
    lastPersistedUiKey = '';
    lastPersistedExplorerKey = '';
    loadWorkspaceMetadataForPath(path);
  });

  $effect(() => {
    const path = workspaceMetadataState.cdbPath;
    workspaceMetadataState.ready;
    workspaceMetadataState.metadata;
    if (!path || !workspaceMetadataState.ready || appliedMetadataPath === path) return;

    const cardWorkspace = getCardWorkspaceUi();
    if (cardWorkspace) {
      if (
        typeof cardWorkspace.activeSurface === 'string'
        && SURFACE_IDS.has(cardWorkspace.activeSurface as CardSurfaceId)
      ) {
        cardSurfaceState.activeSurface = cardWorkspace.activeSurface as CardSurfaceId;
      } else if (!SURFACE_IDS.has(cardSurfaceState.activeSurface)) {
        cardSurfaceState.activeSurface = 'card';
      }

      if (typeof cardWorkspace.explorerPinned === 'boolean') {
        cardSurfaceState.explorerPinned = cardWorkspace.explorerPinned;
      }
    }

    const explorer = getCardExplorerState();
    if (explorer) {
      const filters = { ...DEFAULT_SEARCH_FILTERS, ...(explorer.filters ?? {}) };
      const selectedIds = Array.isArray(explorer.selectedIds) ? [...explorer.selectedIds] : [];
      const selectedId = typeof explorer.selectedId === 'number' ? explorer.selectedId : selectedIds[0] ?? null;
      const anchorId = typeof explorer.selectionAnchorId === 'number' ? explorer.selectionAnchorId : selectedId;
      const page = Number.isInteger(explorer.page) && Number(explorer.page) > 0
        ? Number(explorer.page)
        : 1;
      editorState.searchFilters = filters;
      editorState.currentPage = page;
      void handleSearch(false, false).then((ok) => {
        if (!ok || workspaceMetadataState.cdbPath !== path) return;
        setSelectedCards(selectedIds, selectedId, anchorId);
      });
      lastPersistedExplorerKey = JSON.stringify({
        filters,
        selectedIds,
        selectedId,
        selectionAnchorId: anchorId,
        page,
      });
    }

    appliedMetadataPath = path;
    lastPersistedUiKey = JSON.stringify({
      path,
      activeSurface: cardSurfaceState.activeSurface,
      explorerPinned: cardSurfaceState.explorerPinned,
    });
  });

  $effect(() => {
    const path = workspaceMetadataState.cdbPath;
    const nextKey = JSON.stringify({
      path,
      activeSurface: cardSurfaceState.activeSurface,
      explorerPinned: cardSurfaceState.explorerPinned,
    });
    if (!path || !workspaceMetadataState.ready || appliedMetadataPath !== path || nextKey === lastPersistedUiKey) {
      return;
    }

    lastPersistedUiKey = nextKey;
    setCardWorkspaceUi({
      activeSurface: cardSurfaceState.activeSurface,
      explorerPinned: cardSurfaceState.explorerPinned,
    });
  });

  $effect(() => {
    const path = workspaceMetadataState.cdbPath;
    const nextKey = JSON.stringify({
      filters: editorState.searchFilters,
      selectedIds: editorState.selectedIds,
      selectedId: editorState.selectedId,
      selectionAnchorId: editorState.selectionAnchorId,
      page: editorState.currentPage,
    });
    if (!path || !workspaceMetadataState.ready || appliedMetadataPath !== path || nextKey === lastPersistedExplorerKey) {
      return;
    }

    lastPersistedExplorerKey = nextKey;
    setCardExplorerState({
      filters: editorState.searchFilters,
      selectedIds: editorState.selectedIds,
      selectedId: editorState.selectedId,
      selectionAnchorId: editorState.selectionAnchorId,
      page: editorState.currentPage,
    });
  });
</script>

<div
  class="editor-layout"
  class:focus-mode={focusMode}
  class:explorer-pinned={cardSurfaceState.explorerPinned}
>
  <div class="explorer-shell" class:pinned={cardSurfaceState.explorerPinned}>
    <div class="explorer-panel">
      <CardList />
    </div>
  </div>

  <CardSurfaceRail />

  <div class="surface-host">
    <div class="card-surface-pane" class:hidden={cardSurfaceState.activeSurface !== 'card'}>
      <CardEditor />
    </div>
    {#if cardSurfaceState.activeSurface === 'script'}
      <ScriptSurface />
    {:else if extensionSurfaceError}
      <div class="surface-error" role="alert">{extensionSurfaceError}</div>
    {:else if loadedExtensionSurface?.id === cardSurfaceState.activeSurface}
      {@const ExtensionSurface = loadedExtensionSurface.component}
      <ExtensionSurface />
    {/if}
  </div>
</div>

<style>
  .editor-layout {
    display: flex;
    height: 100%;
    overflow: hidden;
    background: var(--bg-base);
  }

  .explorer-shell {
    flex: 0 0 23rem;
    min-width: 23rem;
    max-width: 23rem;
    height: 100%;
    position: relative;
    z-index: 18;
    transition: flex-basis 0.18s ease, min-width 0.18s ease, max-width 0.18s ease;
  }

  .explorer-panel {
    width: 23rem;
    height: 100%;
    transition: transform 0.18s ease, box-shadow 0.18s ease;
  }

  .focus-mode:not(.explorer-pinned) .explorer-shell {
    flex-basis: 20px;
    min-width: 20px;
    max-width: 20px;
  }

  .focus-mode:not(.explorer-pinned) .explorer-panel {
    transform: translateX(calc(-23rem + 20px));
    box-shadow: none;
  }

  .focus-mode:not(.explorer-pinned) .explorer-shell:hover {
    z-index: 45;
  }

  .focus-mode:not(.explorer-pinned) .explorer-shell:hover .explorer-panel,
  .focus-mode:not(.explorer-pinned) .explorer-shell:focus-within .explorer-panel {
    transform: translateX(0);
    box-shadow: var(--shadow-popover);
  }

  .focus-mode:not(.explorer-pinned) .explorer-shell::after {
    content: '';
    position: absolute;
    inset: 0 0 0 auto;
    width: 20px;
    border-right: 1px solid var(--border-color);
    background:
      linear-gradient(90deg, transparent, color-mix(in srgb, var(--bg-surface) 96%, var(--bg-base)));
    pointer-events: none;
  }

  .surface-host {
    flex: 1;
    min-width: 0;
    height: 100%;
    overflow: hidden;
  }

  .card-surface-pane {
    width: 100%;
    height: 100%;
  }

  .card-surface-pane.hidden {
    display: none;
  }

  .surface-error {
    display: grid;
    place-items: center;
    height: 100%;
    padding: 2rem;
    color: var(--danger-text, #f87171);
    text-align: center;
  }
</style>
