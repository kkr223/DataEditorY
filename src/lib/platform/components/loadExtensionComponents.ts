import type { Component } from 'svelte';

export async function loadExtensionComponents(
  descriptors: ReadonlyArray<{ id: string; component: () => Promise<unknown> }>,
  onError: (reason: unknown) => void,
) {
  const results = await Promise.allSettled(descriptors.map(async (descriptor) => ({
    id: descriptor.id,
    component: (await descriptor.component() as { default: Component }).default,
  })));

  return results.flatMap((result) => {
    if (result.status === 'fulfilled') return [result.value];
    onError(result.reason);
    return [];
  });
}
