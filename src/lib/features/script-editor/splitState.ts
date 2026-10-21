import { writable } from 'svelte/store';
import type { ScriptPair } from '$lib/domain/script/splitTabs';

export const scriptSplitPairs = writable<Record<string, ScriptPair | undefined>>({});

export function setScriptPair(ownerId: string, pair: ScriptPair) {
  scriptSplitPairs.update((pairs) => ({ ...pairs, [ownerId]: pair }));
}

export function clearScriptPair(ownerId: string) {
  scriptSplitPairs.update((pairs) => {
    const next = { ...pairs };
    delete next[ownerId];
    return next;
  });
}
