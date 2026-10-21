<script lang="ts">
  import { untrack } from 'svelte';
  import { _ } from 'svelte-i18n';
  import type { ScriptWorkspaceState } from '$lib/types';
  import { showToast } from '$lib/stores/toast.svelte';
  import { createSplitScriptRuntime } from '../splitRuntime';
  let { left, right }: { left: ScriptWorkspaceState; right: ScriptWorkspaceState } = $props();
  let compare = $state(false);
  let host = $state<HTMLDivElement>();
  const pairKey = $derived(`${left.id}:${right.id}`);
  $effect(() => {
    const identity = pairKey;
    const comparing = compare;
    if (!host || !identity) return;
    let cancelled = false;
    let runtime: Awaited<ReturnType<typeof createSplitScriptRuntime>> = null;
    void createSplitScriptRuntime({ host, left: untrack(() => left), right: untrack(() => right), compare: comparing, isCancelled: () => cancelled })
      .then((created) => { if (cancelled) created?.dispose(); else runtime = created; })
      .catch((error) => { if (!cancelled) showToast(String(error), 'error'); });
    return () => { cancelled = true; runtime?.dispose(); };
  });
</script>

<section class="split-editor">
  <div class="split-toolbar">
    <span>c{left.cardCode}.lua <span class="divider">↔</span> c{right.cardCode}.lua</span>
    <label title={$_('context_menu.compare_hint')}><input type="checkbox" role="switch" bind:checked={compare} />{$_('context_menu.compare')}</label>
  </div>
  <div class="split-host" bind:this={host}></div>
</section>

<style>
  .split-editor { height: 100%; min-height: 0; display: flex; flex-direction: column; background: var(--bg-base); }
  .split-toolbar { flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; padding: 7px 12px; border-bottom: 1px solid var(--border-color); color: var(--text-secondary); font-size: .85rem; }
  .divider { margin: 0 12px; opacity: .6; }
  label { display: flex; align-items: center; gap: 7px; color: var(--text-primary); cursor: pointer; }
  input { accent-color: var(--accent-primary); }
  .split-host { flex: 1; min-height: 0; min-width: 0; overflow: hidden; }
  .split-host :global(.monaco-editor + div) { border-left: 1px solid var(--border-color); }
</style>
