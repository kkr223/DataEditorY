<script lang="ts">
  import type { Component } from 'svelte';
  import { documentRuntime } from '$lib/platform/appRuntime';
  import { loadExtensionComponents } from './loadExtensionComponents';

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
    void loadExtensionComponents(targets, (error) => {
      console.error('Failed to load workbench contribution', error);
    }).then((components) => {
      loaded = components;
    });
  });
</script>

{#each loaded as contribution (contribution.id)}
  <contribution.component {context} />
{/each}
