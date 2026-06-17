<script lang="ts">
  import type { Component } from 'svelte';
  import { documentRuntime } from '$lib/platform/appRuntime';

  let {
    workbenchId,
    slot,
    context,
  }: {
    workbenchId: string;
    slot: string;
    context: unknown;
  } = $props();

  const descriptors = $derived(
    documentRuntime.registry.findWorkbenchContributions(workbenchId, slot),
  );
  let loaded = $state<Array<{ id: string; component: Component }>>([]);

  $effect(() => {
    const targets = descriptors;
    void Promise.all(targets.map(async (descriptor) => ({
      id: descriptor.id,
      component: (await descriptor.component() as { default: Component }).default,
    }))).then((components) => {
      loaded = components;
    });
  });
</script>

{#each loaded as contribution (contribution.id)}
  <contribution.component {context} />
{/each}
