<script lang="ts">
  import { onDestroy } from 'svelte';
  import { _ } from 'svelte-i18n';
  import LuaScriptEditor from '$lib/components/LuaScriptEditor.svelte';
  import { tabDrag } from '$lib/components/tabDrag';
  import { activeTab } from '$lib/stores/db';
  import { getSelectedCard } from '$lib/stores/editor.svelte';
  import {
    activateScriptTab,
    activeScriptTab,
    activeScriptTabId,
    closeScriptTab,
    openExistingScriptTab,
    moveScriptTab,
    scriptTabs,
    setScriptTabViewState,
  } from '$lib/stores/scriptEditor.svelte';
  import { openCardScriptWorkspace } from '$lib/services/cardScriptService';
  import {
    getScriptSurfaceState,
    setScriptSurfaceState,
    workspaceMetadataState,
  } from '$lib/modules/card/workbench/workspaceMetadataState.svelte';
  import {
    getScriptTabKey,
    isScriptTabOwnedByCdb,
  } from '$lib/domain/script/tabIdentity';
  import { getWorkspaceDocument } from '$lib/core/workspace/store.svelte';
  import { confirmWorkspaceClose } from '$lib/application/workspace/lifecycle';
  import { showToast } from '$lib/stores/toast.svelte';
  import { cardSurfaceState } from './surfaceState.svelte';

  let {
    selectionReady = false,
    openSelectedRequest = 0,
    onOpenSelectedRequestHandled,
  }: {
    selectionReady?: boolean;
    openSelectedRequest?: number;
    onOpenSelectedRequestHandled?: () => void;
  } = $props();

  let isOpening = $state(false);
  let isMissingScript = $state(false);
  let createSelectedRequested = $state(false);
  let restoredWorkspaceKey = $state('');
  let restorationCompleteWorkspaceKey = $state('');
  let lastPersistedScriptKey = '';
  let lastResolvedCardKey = '';
  let lastRestorationWorkspaceKey = '';
  let restorationSequence = 0;
  let resolveSequence = 0;
  const selectedCard = $derived(getSelectedCard());
  const activeCdb = $derived($activeTab);
  const workspaceKey = $derived(activeCdb ? JSON.stringify([activeCdb.id, activeCdb.path]) : '');
  const currentCdbScriptTabs = $derived.by(() => (
    activeCdb
      ? $scriptTabs.filter((tab) => isScriptTabOwnedByCdb(tab, { tabId: activeCdb.id, path: activeCdb.path }))
      : []
  ));
  const surfaceScriptTab = $derived.by(() => {
    const tab = $activeScriptTab;
    if (!tab || !activeCdb) return null;
    return isScriptTabOwnedByCdb(tab, { tabId: activeCdb.id, path: activeCdb.path }) ? tab : null;
  });

  onDestroy(() => {
    restorationSequence += 1;
    resolveSequence += 1;
  });

  async function closeSurfaceScriptTab(tabId: string) {
    const workspace = getWorkspaceDocument(tabId);
    if (workspace && !(await confirmWorkspaceClose(workspace))) return;
    await closeScriptTab(tabId);
  }

  function openSelectedScript() {
    createSelectedRequested = true;
  }

  $effect(() => {
    const path = activeCdb?.path ?? '';
    const sourceTabId = activeCdb?.id ?? null;
    const key = workspaceKey;
    if (key !== lastRestorationWorkspaceKey) {
      lastRestorationWorkspaceKey = key;
      restorationSequence += 1;
      resolveSequence += 1;
      lastResolvedCardKey = '';
      isOpening = false;
      isMissingScript = false;
      createSelectedRequested = false;
    }
    const sequence = restorationSequence;
    workspaceMetadataState.ready;
    workspaceMetadataState.metadata;
    if (!selectionReady || !path || !sourceTabId || !workspaceMetadataState.ready || workspaceMetadataState.cdbPath !== path || restoredWorkspaceKey === key) {
      return;
    }

    restoredWorkspaceKey = key;
    const initialCardKey = selectedCard ? getScriptTabKey(path, selectedCard.code) : '';
    const isCurrentRestoration = () => sequence === restorationSequence && workspaceKey === key && selectionReady;
    const surfaceState = getScriptSurfaceState();
    const openTabs = surfaceState?.openTabs ?? [];
    const activeCode = surfaceState?.activeCardCode ?? openTabs[0]?.cardCode ?? null;
    lastPersistedScriptKey = JSON.stringify({
      openTabs,
      activeCardCode: activeCode,
    });

    void (async () => {
      try {
        for (const tab of openTabs) {
          const tabId = await openExistingScriptTab({
            cdbPath: path,
            sourceTabId,
            cardCode: tab.cardCode,
            cardName: tab.cardName ?? '',
            activate: false,
          });
          if (sequence !== restorationSequence || workspaceKey !== key) return;
          if (tabId && tab.viewState) {
            setScriptTabViewState(tabId, tab.viewState);
          }
        }

        if (sequence !== restorationSequence || workspaceKey !== key) return;
        const currentActive = $activeScriptTab;
        const alreadyActive = currentActive
          && isScriptTabOwnedByCdb(currentActive, { tabId: sourceTabId, path })
          && currentCdbScriptTabs.some((tab) => tab.id === currentActive.id);
        const active = alreadyActive ? currentActive : $scriptTabs.find((tab) => (
          isScriptTabOwnedByCdb(tab, { tabId: sourceTabId, path }) && tab.cardCode === activeCode
        ));
        if (active) {
          await activateScriptTab(active.id, undefined, isCurrentRestoration);
          if (!isCurrentRestoration()) return;
          // Returning to a workspace restores its active script independently of
          // Explorer selection. Only a subsequent card change should follow it.
          if ((selectedCard ? getScriptTabKey(path, selectedCard.code) : '') === initialCardKey) {
            lastResolvedCardKey = initialCardKey;
          }
        }
      } catch (error) {
        console.error('Failed to restore script surface tabs', error);
      } finally {
        if (sequence === restorationSequence && workspaceKey === key) {
          restorationCompleteWorkspaceKey = key;
        }
      }
    })();
  });

  $effect(() => {
    const path = activeCdb?.path ?? '';
    const sourceTabId = activeCdb?.id ?? null;
    const cardCode = selectedCard?.code ?? 0;
    const cardName = selectedCard?.name ?? '';
    const cardKey = path && cardCode ? getScriptTabKey(path, cardCode) : '';
    const requested = openSelectedRequest > 0 || createSelectedRequested;
    if (!selectionReady || !cardKey || !sourceTabId || restorationCompleteWorkspaceKey !== workspaceKey
      || (!requested && lastResolvedCardKey === cardKey)) {
      return;
    }

    lastResolvedCardKey = cardKey;
    if (openSelectedRequest > 0) onOpenSelectedRequestHandled?.();
    createSelectedRequested = false;
    const sequence = ++resolveSequence;
    const key = workspaceKey;
    const canActivate = () => sequence === resolveSequence && workspaceKey === key && selectionReady
      && cardSurfaceState.activeSurface === 'script'
      && getScriptTabKey(activeCdb?.path ?? '', selectedCard?.code ?? 0) === cardKey;
    isOpening = true;
    isMissingScript = false;
    if (
      $activeScriptTab
      && isScriptTabOwnedByCdb($activeScriptTab, { tabId: sourceTabId, path })
      && $activeScriptTab.cardCode !== cardCode
    ) {
      activeScriptTabId.set(null);
    }
    const input = {
      cdbPath: path,
      sourceTabId,
      cardCode,
      cardName,
      activate: false as const,
    };
    const opening = requested
      ? openCardScriptWorkspace(input).then((result) => result?.tabId ?? null)
      : openExistingScriptTab(input);
    void opening
      .then(async (tabId) => {
        if (!canActivate()) return;
        if (!tabId) {
          isMissingScript = true;
          return;
        }
        await activateScriptTab(tabId, undefined, canActivate);
      })
      .catch((error) => {
        if (sequence !== resolveSequence) return;
        showToast(
          `${$_('editor.script_open_failed')}: ${error instanceof Error ? error.message : String(error)}`,
          'error',
        );
      })
      .finally(() => {
        if (sequence === resolveSequence) isOpening = false;
      });
  });

  $effect(() => {
    const path = activeCdb?.path ?? '';
    const sourceTabId = activeCdb?.id ?? null;
    if (!selectionReady || !path || !sourceTabId || !workspaceMetadataState.ready || workspaceMetadataState.cdbPath !== path || restorationCompleteWorkspaceKey !== workspaceKey) {
      return;
    }

    const openTabs = $scriptTabs
      .filter((tab) => isScriptTabOwnedByCdb(tab, { tabId: sourceTabId, path }))
      .map((tab) => ({
        cardCode: tab.cardCode,
        cardName: tab.cardName,
        scriptPath: tab.scriptPath,
        viewState: tab.viewState,
      }));
    const activeCardCode = $activeScriptTab
      && isScriptTabOwnedByCdb($activeScriptTab, { tabId: sourceTabId, path })
      ? $activeScriptTab.cardCode
      : null;
    const nextKey = JSON.stringify({ openTabs, activeCardCode });
    if (nextKey === lastPersistedScriptKey) return;

    lastPersistedScriptKey = nextKey;
    setScriptSurfaceState({ openTabs, activeCardCode });
  });
</script>

<section class="script-surface">
  {#if currentCdbScriptTabs.length}
    <nav class="script-tab-strip" aria-label={$_('surface.script')}>
      {#each currentCdbScriptTabs as tab (tab.id)}
        <div
          use:tabDrag={{ id: tab.id, scope: workspaceKey, onMove: moveScriptTab }}
          class:active={$activeScriptTab?.id === tab.id}
          class="script-tab"
          onauxclick={(event) => { if (event.button === 1) { event.preventDefault(); void closeSurfaceScriptTab(tab.id); } }}
        >
          <button type="button" class="script-tab-main" onclick={() => activateScriptTab(tab.id)}>
            c{tab.cardCode}.lua{tab.isDirty ? ' *' : ''}
          </button>
          <button
            type="button"
            class="script-tab-close"
            data-tab-close
            aria-label={$_('editor.script_reference_close')}
            title={$_('editor.script_reference_close')}
            onclick={() => void closeSurfaceScriptTab(tab.id)}
          >x</button>
        </div>
      {/each}
    </nav>
  {/if}
  <div class="script-content">
  {#if surfaceScriptTab}
    <LuaScriptEditor />
  {:else}
    <div class="surface-empty">
      <div class="empty-card">
        <h2>{$_('surface.script')}</h2>
        <p>{$_('surface.script_hint')}</p>
        <div class="context-line">
          <span>{$_('surface.context_card')}</span>
          <strong>{selectedCard ? `${selectedCard.code} ${selectedCard.name}` : $_('surface.context_none')}</strong>
        </div>
        <button
          type="button"
          class="primary-action"
          disabled={!selectionReady || !selectedCard || !activeCdb || isOpening}
          onclick={() => void openSelectedScript()}
        >
          {isOpening ? '...' : $_(isMissingScript ? 'surface.create_script' : 'surface.open_script')}
        </button>
      </div>
    </div>
  {/if}
  </div>
</section>

<style>
  .script-surface {
    height: 100%;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--bg-base);
  }

  .script-tab-strip {
    flex: 0 0 34px;
    min-width: 0;
    display: flex;
    align-items: end;
    gap: 2px;
    padding: 3px 6px 0;
    overflow-x: auto;
    border-bottom: 1px solid var(--border-color);
    background: var(--bg-surface);
  }

  .script-tab {
    position: relative;
    user-select: none;
    touch-action: pan-y;
    flex: 0 0 auto;
    height: 30px;
    display: flex;
    align-items: center;
    border: 1px solid transparent;
    border-bottom: none;
    border-radius: var(--control-radius) var(--control-radius) 0 0;
    color: var(--text-secondary);
  }

  .script-tab.active {
    border-color: var(--border-color);
    background: var(--bg-base);
    color: var(--text-primary);
  }

  .script-tab:global([data-tab-dragging]) { opacity: 0.45; }
  .script-tab:global([data-tab-dragging]) button { cursor: grabbing; }
  .script-tab:global([data-tab-drop='before']) { box-shadow: inset 3px 0 var(--accent-primary); }
  .script-tab:global([data-tab-drop='after']) { box-shadow: inset -3px 0 var(--accent-primary); }

  .script-tab button {
    height: 100%;
    border: none;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }

  .script-tab-main {
    padding: 0 7px 0 9px;
    font-weight: 700;
  }

  .script-tab-close {
    width: 27px;
    padding: 0;
    font-size: 0.72rem;
  }

  .script-tab-close:hover {
    background: var(--bg-surface-hover);
  }

  .script-content {
    flex: 1 1 auto;
    min-height: 0;
    min-width: 0;
    overflow: hidden;
  }

  .surface-empty {
    height: 100%;
    display: grid;
    place-items: center;
    padding: 24px;
  }

  .empty-card {
    width: min(520px, 100%);
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 20px;
    border: 1px solid var(--border-color);
    border-radius: var(--control-radius-soft);
    background: var(--bg-surface);
  }

  h2 {
    margin: 0;
    font-size: 1.05rem;
    color: var(--text-primary);
  }

  p {
    margin: 0;
    line-height: 1.55;
    color: var(--text-secondary);
  }

  .context-line {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    padding: 10px 12px;
    border: 1px solid var(--border-color);
    border-radius: var(--control-radius);
    background: var(--bg-base);
    color: var(--text-secondary);
  }

  .context-line strong {
    color: var(--text-primary);
    text-align: right;
  }

  .primary-action {
    align-self: flex-start;
    border: none;
    border-radius: var(--control-radius);
    background: var(--accent-primary);
    color: white;
    padding: 0.52rem 0.82rem;
    font-weight: 700;
    cursor: pointer;
  }

  .primary-action:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
