<script lang="ts">
  import type { CardDataEntry } from "$lib/types";

  type CardImageDrawerModule = typeof import("$lib/components/CardImageDrawer.svelte");

  export let open = false;
  export let card: CardDataEntry;
  export let cdbPath = "";
  export let onSavedJpg: () => void | Promise<void> = () => {};
  export let onClose: () => void = () => {};

  let modulePromise: Promise<CardImageDrawerModule> | null = null;

  $: if (open && !modulePromise) {
    modulePromise = import("$lib/components/CardImageDrawer.svelte");
  }
</script>

{#if open && modulePromise}
  {#await modulePromise then module}
    <module.default
      {open}
      {card}
      {cdbPath}
      {onSavedJpg}
      {onClose}
    />
  {/await}
{/if}
