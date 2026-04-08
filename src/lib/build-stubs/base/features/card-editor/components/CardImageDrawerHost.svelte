<script lang="ts">
  import type { CardDataEntry } from "$lib/types";

  export let open = false;
  export let card: CardDataEntry;
  export let cdbPath = "";
  export let onSavedJpg: () => void | Promise<void> = () => {};
  export let onClose: () => void = () => {};

  $: void [open, card, cdbPath, onSavedJpg, onClose];
</script>
