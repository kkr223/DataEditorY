<script lang="ts">
  import { activeTabId, getCachedCards } from '$lib/stores/db';
  import { editorState, setAllCards, getAllCards } from '$lib/stores/editor.svelte';
  import CardList from '$lib/components/CardList.svelte';
  import CardEditor from '$lib/components/CardEditor.svelte';

  // React to tab changes: use cached results for instant switching
  let lastTabId: string | null = null;
  $effect(() => {
    const currentTabId = $activeTabId;
    if (currentTabId !== lastTabId) {
      lastTabId = currentTabId;
      if (currentTabId) {
        setAllCards(getCachedCards());
        editorState.currentPage = 1;
        const cards = getAllCards();
        editorState.selectedId = cards.length > 0 ? cards[0].code : null;
      } else {
        setAllCards([]);
        editorState.currentPage = 1;
        editorState.selectedId = null;
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
