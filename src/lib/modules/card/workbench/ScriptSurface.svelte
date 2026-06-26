<script lang="ts">
  import { _ } from 'svelte-i18n';
  import LuaScriptEditor from '$lib/components/LuaScriptEditor.svelte';
  import { activeTab } from '$lib/stores/db';
  import { getSelectedCard } from '$lib/stores/editor.svelte';
  import {
    activateScriptTab,
    activeScriptTab,
    activeScriptTabId,
    closeScriptTab,
    openExistingScriptTab,
    scriptTabs,
    setScriptTabViewState,
  } from '$lib/stores/scriptEditor.svelte';
  import {
    getExistingCardScriptInfo,
    openCardScriptWorkspace,
  } from '$lib/services/cardScriptService';
  import {
    getScriptSurfaceState,
    setScriptSurfaceState,
    workspaceMetadataState,
  } from '$lib/modules/card/workbench/workspaceMetadataState.svelte';
  import {
    getScriptTabKey,
    isSameCdbPath,
  } from '$lib/domain/script/tabIdentity';
  import { getWorkspaceDocument } from '$lib/core/workspace/store.svelte';
  import { confirmWorkspaceClose } from '$lib/application/workspace/lifecycle';

  let isOpening = $state(false);
  let isMissingScript = $state(false);
  let restoredPath = '';
  let restorationCompletePath = '';
  let lastPersistedScriptKey = '';
  let lastResolvedCardKey = '';
  let resolveSequence = 0;
  const selectedCard = $derived(getSelectedCard());
  const activeCdb = $derived($activeTab);
  const currentCdbScriptTabs = $derived.by(() => (
    activeCdb
      ? $scriptTabs.filter((tab) => isSameCdbPath(tab.cdbPath, activeCdb.path))
      : []
  ));
  const surfaceScriptTab = $derived.by(() => {
    const tab = $activeScriptTab;
    if (!tab || !activeCdb) return null;
    return isSameCdbPath(tab.cdbPath, activeCdb.path) ? tab : null;
  });

  async function closeSurfaceScriptTab(tabId: string) {
    const workspace = getWorkspaceDocument(tabId);
    if (workspace && !(await confirmWorkspaceClose(workspace))) return;
    await closeScriptTab(tabId);
  }

  async function openSelectedScript() {
    if (!activeCdb || !selectedCard || isOpening) return;
    isOpening = true;
    try {
      await openCardScriptWorkspace({
        cdbPath: activeCdb.path,
        sourceTabId: activeCdb.id,
        cardCode: selectedCard.code,
        cardName: selectedCard.name ?? '',
      });
      isMissingScript = false;
    } finally {
      isOpening = false;
    }
  }

  $effect(() => {
    const path = activeCdb?.path ?? '';
    const sourceTabId = activeCdb?.id ?? null;
    workspaceMetadataState.ready;
    workspaceMetadataState.metadata;
    if (!path || !sourceTabId || !workspaceMetadataState.ready || workspaceMetadataState.cdbPath !== path || restoredPath === path) {
      return;
    }

    restoredPath = path;
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
          if (tabId && tab.viewState) {
            setScriptTabViewState(tabId, tab.viewState);
          }
        }

        if (activeCode) {
          const active = $scriptTabs.find((tab) => isSameCdbPath(tab.cdbPath, path) && tab.cardCode === activeCode);
          if (active) activateScriptTab(active.id);
        }
      } catch (error) {
        console.error('Failed to restore script surface tabs', error);
      } finally {
        restorationCompletePath = path;
      }
    })();
  });

  $effect(() => {
    const path = activeCdb?.path ?? '';
    const sourceTabId = activeCdb?.id ?? null;
    const cardCode = selectedCard?.code ?? 0;
    const cardName = selectedCard?.name ?? '';
    const cardKey = path && cardCode ? getScriptTabKey(path, cardCode) : '';
    if (!cardKey || !sourceTabId || restorationCompletePath !== path || lastResolvedCardKey === cardKey) {
      return;
    }

    lastResolvedCardKey = cardKey;
    const sequence = ++resolveSequence;
    isOpening = true;
    isMissingScript = false;
    if ($activeScriptTab && isSameCdbPath($activeScriptTab.cdbPath, path) && $activeScriptTab.cardCode !== cardCode) {
      activeScriptTabId.set(null);
    }
    void getExistingCardScriptInfo(path, cardCode)
      .then(async (info) => {
        if (sequence !== resolveSequence || getScriptTabKey(activeCdb?.path ?? '', selectedCard?.code ?? 0) !== cardKey) return;
        if (!info.exists) {
          isMissingScript = true;
          return;
        }
        await openExistingScriptTab({
          cdbPath: path,
          sourceTabId,
          cardCode,
          cardName,
          activate: true,
        });
      })
      .finally(() => {
        if (sequence === resolveSequence) isOpening = false;
      });
  });

  $effect(() => {
    const path = activeCdb?.path ?? '';
    if (!path || !workspaceMetadataState.ready || workspaceMetadataState.cdbPath !== path || restoredPath !== path) {
      return;
    }

    const openTabs = $scriptTabs
      .filter((tab) => isSameCdbPath(tab.cdbPath, path))
      .map((tab) => ({
        cardCode: tab.cardCode,
        cardName: tab.cardName,
        scriptPath: tab.scriptPath,
        viewState: tab.viewState,
      }));
    const activeCardCode = $activeScriptTab && isSameCdbPath($activeScriptTab.cdbPath, path)
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
      {#each currentCdbScriptTabs as tab}
        <div class:active={$activeScriptTab?.id === tab.id} class="script-tab">
          <button type="button" class="script-tab-main" onclick={() => activateScriptTab(tab.id)}>
            c{tab.cardCode}.lua{tab.isDirty ? ' *' : ''}
          </button>
          <button
            type="button"
            class="script-tab-close"
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
          disabled={!selectedCard || !activeCdb || isOpening}
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
