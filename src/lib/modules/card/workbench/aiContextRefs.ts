import type { WorkspaceAiContextRef } from './workspaceMetadataState.svelte';

const getContextIdentity = (ref: WorkspaceAiContextRef) => {
  const value = ref.value && typeof ref.value === 'object'
    ? ref.value as Record<string, unknown>
    : {};
  if (ref.type === 'cdb' || ref.type === 'selection') return ref.type;
  if (ref.type === 'script') {
    return `${ref.type}:${String(value.path ?? value.cardCode ?? ref.label)}`;
  }
  return `${ref.type}:${String(value.cardCode ?? ref.label)}`;
};

export const mergeWorkspaceAiContextRefs = (
  preserved: WorkspaceAiContextRef[],
  current: WorkspaceAiContextRef[],
) => {
  const merged = new Map<string, WorkspaceAiContextRef>();
  for (const ref of [...preserved, ...current]) {
    merged.set(getContextIdentity(ref), ref);
  }
  return [...merged.values()];
};
