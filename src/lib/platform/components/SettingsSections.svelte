<script lang="ts">
  import type { Component } from 'svelte';
  import { documentRuntime } from '$lib/platform/appRuntime';
  import { loadExtensionComponents } from './loadExtensionComponents';

  let { context }: { context: unknown } = $props();

  const descriptors = documentRuntime.registry.findSettingsSections();
  let loaded = $state<Array<{ id: string; component: Component }>>([]);

  $effect(() => {
    void loadExtensionComponents(descriptors, (error) => {
      console.error('Failed to load settings section', error);
    }).then((components) => {
      loaded = components;
    });
  });
</script>

{#each loaded as section (section.id)}
  <section.component {context} />
{/each}
