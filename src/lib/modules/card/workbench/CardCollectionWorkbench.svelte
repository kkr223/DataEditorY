<script lang="ts">
  import CardList from '$lib/components/CardList.svelte';
  import CardEditor from '$lib/components/CardEditor.svelte';
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
