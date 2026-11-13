<script lang="ts">
  import { _ } from 'svelte-i18n';
  import {
    activateCardSurface,
    cardSurfaceState,
    requestSurfaceOpen,
    toggleCardExplorerPinned,
  } from '#lib/modules/card/workbench/surfaceState.svelte.ts';
  import { activateEditorView } from '#lib/stores/appShell.svelte.ts';
  import { documentRuntime } from '#lib/platform/appRuntime.ts';

  type SurfaceMetadata = {
    surfaceId?: string;
    labelKey?: string;
    icon?: string;
    openOnActivate?: boolean;
    requiresWorkspaceMetadata?: boolean;
    activate?: () => void;
  };

  type SurfaceEntry = {
    id: string;
    labelKey: string;
    icon: string;
    openOnActivate?: boolean;
    activate?: () => void;
  };

  const extensionSurfaces = documentRuntime.registry
    .findWorkbenchContributions('card.workbench', 'surface')
    .flatMap<SurfaceEntry>((contribution) => {
      const metadata = contribution.metadata as SurfaceMetadata | undefined;
      const id = metadata?.surfaceId;
      const labelKey = metadata?.labelKey;
      const icon = metadata?.icon;
      if (typeof id !== 'string' || typeof labelKey !== 'string' || typeof icon !== 'string') {
        return [];
      }
      return [{
        id,
        labelKey,
        icon,
        openOnActivate: metadata?.openOnActivate,
        activate: metadata?.activate,
      }];
    });

  const surfaces: SurfaceEntry[] = [
    { id: 'card', labelKey: 'surface.card', icon: '◇' },
    ...extensionSurfaces,
  ];

  function selectSurface(surface: SurfaceEntry) {
    activateCardSurface(surface.id);
    if (surface.openOnActivate) requestSurfaceOpen(surface.id);
    if (surface.activate) {
      surface.activate();
      return;
    }
    activateEditorView();
  }
</script>

{#if surfaces.length > 1}
<aside class="surface-rail" aria-label={$_('surface.title')}>
  <div class="surface-tabs">
    {#each surfaces as surface (surface.id)}
      <button
        type="button"
        class="surface-tab"
        class:active={cardSurfaceState.activeSurface === surface.id}
        title={$_(surface.labelKey)}
        aria-label={$_(surface.labelKey)}
        onclick={() => selectSurface(surface)}
      >
        <span class="surface-icon">{surface.icon}</span>
      </button>
    {/each}
  </div>

  <button
    type="button"
    class="pin-tab"
    class:active={cardSurfaceState.explorerPinned}
    title={cardSurfaceState.explorerPinned ? $_('surface.unpin_explorer') : $_('surface.pin_explorer')}
    aria-label={cardSurfaceState.explorerPinned ? $_('surface.unpin_explorer') : $_('surface.pin_explorer')}
    onclick={toggleCardExplorerPinned}
  >
    {cardSurfaceState.explorerPinned ? '◧' : '◨'}
  </button>
</aside>
{/if}

<style>
  .surface-rail {
    flex: 0 0 42px;
    width: 42px;
    min-width: 42px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: center;
    padding: 8px 5px;
    border-right: 1px solid var(--border-color);
    background: color-mix(in srgb, var(--bg-surface) 86%, var(--bg-base));
  }

  .surface-tabs {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .surface-tab,
  .pin-tab {
    width: 31px;
    height: 31px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid transparent;
    border-radius: var(--control-radius);
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    font: inherit;
    font-weight: 700;
    transition: background-color 0.16s ease, border-color 0.16s ease, color 0.16s ease;
  }

  .surface-tab:hover,
  .pin-tab:hover {
    color: var(--text-primary);
    background: var(--bg-surface-hover);
  }

  .surface-tab.active,
  .pin-tab.active {
    color: var(--text-primary);
    border-color: color-mix(in srgb, var(--accent-primary) 55%, var(--border-color));
    background: color-mix(in srgb, var(--accent-primary) 15%, var(--bg-surface-hover));
  }

  .surface-icon {
    font-size: var(--text-xs);
    line-height: 1;
    letter-spacing: 0;
  }
</style>
