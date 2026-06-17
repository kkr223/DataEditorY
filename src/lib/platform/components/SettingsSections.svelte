<script lang="ts">
  import type { Component } from 'svelte';
  import { documentRuntime } from '$lib/platform/appRuntime';

  let { context }: { context: unknown } = $props();

  const descriptors = documentRuntime.registry.findSettingsSections();
  let loaded = $state<Array<{ id: string; component: Component }>>([]);

  $effect(() => {
    void Promise.all(descriptors.map(async (descriptor) => ({
      id: descriptor.id,
      component: (await descriptor.component() as { default: Component }).default,
    }))).then((components) => {
      loaded = components;
    });
  });
</script>

{#each loaded as section (section.id)}
  <section.component {context} />
{/each}
