<script lang="ts">
  import {
    activeTabId,
    getCachedCards,
    getCachedFilters,
    getCachedPage,
    getCachedSelectionAnchorId,
    getCachedSelectedId,
    getCachedSelectedIds,
    getCachedTotal
  } from '$lib/stores/db';
  import { DEFAULT_SEARCH_FILTERS } from '$lib/types';
  import { clearSelection, editorState, setAllCards, setTotalCards, getAllCards, setSelectedCards, setSingleSelectedCard } from '$lib/stores/editor.svelte';
  import { appShellState } from '$lib/stores/appShell.svelte';

  type CardListModule = typeof import('$lib/components/CardList.svelte');
  type CardEditorModule = typeof import('$lib/components/CardEditor.svelte');
  type LuaScriptEditorModule = typeof import('$lib/components/LuaScriptEditor.svelte');
  type SettingsPanelModule = typeof import('$lib/components/SettingsPanel.svelte');

  function restoreSearchFilters() {
    const cached = getCachedFilters();
    return {
      ...DEFAULT_SEARCH_FILTERS,
      name: cached.name?.toString() ?? '',
      id: cached.id?.toString() ?? '',
      desc: cached.desc?.toString() ?? '',
      rule: cached.rule?.toString() ?? '',
      atkMin: cached.atkMin?.toString() ?? '',
      atkMax: cached.atkMax?.toString() ?? '',
      defMin: cached.defMin?.toString() ?? '',
      defMax: cached.defMax?.toString() ?? '',
      type: cached.type?.toString() ?? '',
      subtype: cached.subtype?.toString() ?? '',
      attribute: cached.attribute?.toString() ?? '',
      race: cached.race?.toString() ?? '',
      setcode1: cached.setcode1?.toString() ?? '',
      setcode2: cached.setcode2?.toString() ?? '',
      setcode3: cached.setcode3?.toString() ?? '',
      setcode4: cached.setcode4?.toString() ?? '',
    };
  }

  let cardListModulePromise = $state<Promise<CardListModule> | null>(null);
  let cardEditorModulePromise = $state<Promise<CardEditorModule> | null>(null);
  let luaScriptEditorModulePromise = $state<Promise<LuaScriptEditorModule> | null>(null);
  let settingsPanelModulePromise = $state<Promise<SettingsPanelModule> | null>(null);

  function ensureEditorModules() {
    cardListModulePromise ??= import('$lib/components/CardList.svelte');
    cardEditorModulePromise ??= import('$lib/components/CardEditor.svelte');
  }

  function ensureScriptEditorModule() {
    luaScriptEditorModulePromise ??= import('$lib/components/LuaScriptEditor.svelte');
  }

  function ensureSettingsPanelModule() {
    settingsPanelModulePromise ??= import('$lib/components/SettingsPanel.svelte');
  }

  // React to tab changes: use cached results for instant switching
  let lastTabId: string | null = null;
  $effect(() => {
    const currentTabId = $activeTabId;
    if (currentTabId !== lastTabId) {
      lastTabId = currentTabId;
      if (currentTabId) {
        setAllCards(getCachedCards());
        setTotalCards(getCachedTotal());
        editorState.searchFilters = restoreSearchFilters();
        editorState.currentPage = getCachedPage();
        const cards = getAllCards();
        const cachedSelectedIds = getCachedSelectedIds();
        if (cachedSelectedIds.length > 0) {
          setSelectedCards(cachedSelectedIds, getCachedSelectedId(), getCachedSelectionAnchorId());
          if (cards.length > 0 && editorState.selectedId === null) {
            setSingleSelectedCard(cards[0].code);
          }
        } else {
          setSingleSelectedCard(cards.length > 0 ? cards[0].code : null);
        }
      } else {
        setAllCards([]);
        setTotalCards(0);
        editorState.currentPage = 1;
        editorState.searchFilters = { ...DEFAULT_SEARCH_FILTERS };
        clearSelection();
      }
    }
  });

  $effect(() => {
    if (appShellState.mainView === 'settings') {
      ensureSettingsPanelModule();
      return;
    }

    if (appShellState.mainView === 'script') {
      ensureScriptEditorModule();
      return;
    }

    ensureEditorModules();
  });
</script>

{#if appShellState.mainView === 'settings'}
  {#if settingsPanelModulePromise}
    {#await settingsPanelModulePromise then module}
      <module.default />
    {/await}
  {/if}
{:else if appShellState.mainView === 'script'}
  {#if luaScriptEditorModulePromise}
    {#await luaScriptEditorModulePromise then module}
      <module.default />
    {/await}
  {/if}
{:else}
  <div class="editor-layout">
    {#if cardListModulePromise}
      {#await cardListModulePromise then module}
        <module.default />
      {/await}
    {/if}
    {#if cardEditorModulePromise}
      {#await cardEditorModulePromise then module}
        <module.default />
      {/await}
    {/if}
  </div>
{/if}

<style>
  .editor-layout {
    display: flex;
    height: 100%;
    overflow: hidden;
  }
</style>
