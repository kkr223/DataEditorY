<script lang="ts">
  import { activeTabId, getCachedCards, getCachedFilters, getCachedPage, getCachedTotal } from '$lib/stores/db';
  import { DEFAULT_SEARCH_FILTERS } from '$lib/types';
  import { clearSelection, editorState, setAllCards, setTotalCards, getAllCards, setSingleSelectedCard } from '$lib/stores/editor.svelte';
  import CardList from '$lib/components/CardList.svelte';
  import CardEditor from '$lib/components/CardEditor.svelte';

  function restoreSearchFilters() {
    const cached = getCachedFilters();
    return {
      ...DEFAULT_SEARCH_FILTERS,
      name: cached.name?.toString() ?? '',
      id: cached.id?.toString() ?? '',
      desc: cached.desc?.toString() ?? '',
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
        setSingleSelectedCard(cards.length > 0 ? cards[0].code : null);
      } else {
        setAllCards([]);
        setTotalCards(0);
        editorState.currentPage = 1;
        editorState.searchFilters = { ...DEFAULT_SEARCH_FILTERS };
        clearSelection();
      }
    }
  });
</script>

<div class="editor-layout">
  <CardList />
  <CardEditor />
</div>

<style>
  .editor-layout {
    display: flex;
    height: 100%;
    overflow: hidden;
  }
</style>
