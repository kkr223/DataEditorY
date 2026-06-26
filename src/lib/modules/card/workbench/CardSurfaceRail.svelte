<script lang="ts">
  import { _ } from 'svelte-i18n';
  import {
    activateCardSurface,
    cardSurfaceState,
    toggleCardExplorerPinned,
    type CardSurfaceId,
  } from '$lib/modules/card/workbench/surfaceState.svelte';
  import { activeTab } from '$lib/stores/db';
  import { activeScriptTab } from '$lib/stores/scriptEditor.svelte';
  import { activateEditorView, activateScriptView } from '$lib/stores/appShell.svelte';
  import { documentRuntime } from '$lib/platform/appRuntime';
  import { isSameCdbPath } from '$lib/domain/script/tabIdentity';

  type SurfaceEntry = {
    id: CardSurfaceId;
    labelKey: string;
    icon: string;
  };

  const extensionSurfaces = documentRuntime.registry
    .findWorkbenchContributions('card.workbench', 'surface')
    .flatMap<SurfaceEntry>((contribution) => {
      const id = contribution.metadata?.surfaceId;
      const labelKey = contribution.metadata?.labelKey;
      const icon = contribution.metadata?.icon;
      if (
        (id !== 'image' && id !== 'ai')
        || typeof labelKey !== 'string'
        || typeof icon !== 'string'
      ) {
        return [];
      }
      return [{ id, labelKey, icon }];
    });

  const surfaces: SurfaceEntry[] = [
    { id: 'card', labelKey: 'surface.card', icon: '◇' },
    { id: 'script', labelKey: 'surface.script', icon: '{}' },
    ...extensionSurfaces,
  ];

  const hasCurrentCdbScriptTab = $derived(Boolean(
    $activeTab
      && $activeScriptTab
      && isSameCdbPath($activeScriptTab.cdbPath, $activeTab.path),
  ));

  function selectSurface(surface: CardSurfaceId) {
    activateCardSurface(surface);
    if (surface === 'script' && hasCurrentCdbScriptTab) {
      activateScriptView();
      return;
    }

    activateEditorView();
  }
</script>

<aside class="surface-rail" aria-label={$_('surface.title')}>
  <div class="surface-tabs">
    {#each surfaces as surface}
      <button
        type="button"
        class="surface-tab"
        class:active={cardSurfaceState.activeSurface === surface.id}
        title={$_(surface.labelKey)}
        aria-label={$_(surface.labelKey)}
        onclick={() => selectSurface(surface.id)}
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
    font-size: 0.78rem;
    line-height: 1;
    letter-spacing: 0;
  }
</style>
