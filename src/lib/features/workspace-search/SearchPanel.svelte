<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { _ } from 'svelte-i18n';
  import { showToast } from '#lib/stores/toast.svelte.ts';
  import { tauriBridge } from '#lib/infrastructure/tauri/index.ts';
  import { getWorkspaceSearchController } from './state';
  import { openWorkspaceSearchMatch } from './navigation';
  import { openWorkspaceSearchMenu } from './contextMenu';
  import SearchResults from './SearchResults.svelte';
  import SearchReplaceBar from './SearchReplaceBar.svelte';
  import { countSearchMatches, replacementKey } from './results';
  import type { WorkspaceSearchGroup, WorkspaceSearchMatch } from './types';

  let { tab }: { tab: { id: string; name: string; path: string } } = $props();
  const controller = untrack(() => getWorkspaceSearchController(tab));
  const search = controller.state;
  let opening = $state(false);
  let replaceOpen = $state(false);
  let confirming = $state(false);
  let navigationError = $state('');
  const matchCount = $derived(countSearchMatches($search.result));
  const locked = $derived(opening || $search.applying || confirming);
  const previewEdits = $derived(new Map(replaceOpen ? $search.preview?.edits.map(edit => [replacementKey(edit.target), edit.replacement]) : []));
  onDestroy(controller.cancel);

  function openResultMenu(event: MouseEvent, group: WorkspaceSearchGroup, match?: WorkspaceSearchMatch) {
    const result = $search.result;
    openWorkspaceSearchMenu(event, {
      owner: { id: tab.id, path: tab.path }, group, match, onOpen: openResult,
      isCurrent: () => !locked && result !== null && $search.result === result,
      onExclude: () => controller.exclude(group, match),
    });
  }

  async function openResult(group: WorkspaceSearchGroup, match: WorkspaceSearchMatch) {
    if (locked) return;
    opening = true;
    navigationError = '';
    try { await openWorkspaceSearchMatch(tab, group, match); }
    catch (error) {
      navigationError = error instanceof Error ? error.message : String(error);
      showToast(navigationError, 'error');
    }
    finally { opening = false; }
  }

  async function applyReplacement() {
    const preview = $search.preview;
    if (!preview?.edits.length || locked) return;
    confirming = true;
    try {
      const confirmed = await tauriBridge.ask($_('workspace_search.confirm_replace', {
        values: { count: preview.edits.length, cards: preview.cards.length, scripts: preview.scripts.length },
      }), { title: $_('workspace_search.replace_title'), kind: 'warning' });
      if (!confirmed || $search.preview !== preview) return;
      const count = await controller.applyReplace();
      if (count !== null) showToast($_('workspace_search.replaced', { values: { count } }), 'success');
    } catch (error) { showToast(String(error), 'error'); }
    finally { confirming = false; }
  }
</script>

<section class="search-surface" aria-label={$_('surface.search')}>
  <header>
    <div class="heading"><h2>{$_('surface.search')}</h2><span title={tab.path}>{tab.name}</span></div>
    <form onsubmit={(event) => { event.preventDefault(); void controller.run(); }}>
      <div class="query-row">
        <input type="search" aria-label={$_('workspace_search.query')} placeholder={$_('workspace_search.placeholder')}
          disabled={locked}
          value={$search.text} oninput={(event) => controller.change({ text: event.currentTarget.value })} />
        <button type="button" class="option" class:active={$search.caseSensitive} aria-pressed={$search.caseSensitive}
          title={$_('workspace_search.case_sensitive')} aria-label={$_('workspace_search.case_sensitive')}
          disabled={locked} onclick={() => controller.change({ caseSensitive: !$search.caseSensitive })}>Aa</button>
        <button type="button" class="option" class:active={$search.regex} aria-pressed={$search.regex}
          title={$_('workspace_search.regex')} aria-label={$_('workspace_search.regex')}
          disabled={locked} onclick={() => controller.change({ regex: !$search.regex })}>.*</button>
        <button type="button" class="option" class:active={replaceOpen} aria-expanded={replaceOpen}
          disabled={locked} onclick={() => { replaceOpen = !replaceOpen; }}>{$_('workspace_search.replace_title')}</button>
        <button type="submit" class="search-button" disabled={locked || $search.busy || !$search.text || (!$search.searchCards && !$search.searchScripts)}>{$_('workspace_search.run')}</button>
        {#if $search.busy}<button type="button" class="option" onclick={controller.cancel}>{$_('workspace_search.cancel')}</button>{/if}
      </div>
      <div class="scope-row">
        <label><input type="checkbox" disabled={locked} checked={$search.searchCards} onchange={(event) => controller.change({ searchCards: event.currentTarget.checked })} />{$_('workspace_search.cards')}</label>
        <label><input type="checkbox" disabled={locked} checked={$search.searchScripts} onchange={(event) => controller.change({ searchScripts: event.currentTarget.checked })} />{$_('workspace_search.scripts')}</label>
        {#if $search.result}<span role="status">{$_('workspace_search.matches', { values: { count: matchCount } })}</span>{/if}
      </div>
    </form>
    {#if replaceOpen}
      <SearchReplaceBar replacement={$search.replacement} preview={$search.preview} planning={$search.planning}
        disabled={locked} canPreview={matchCount > 0 && !$search.busy} regex={$search.regex}
        onChange={controller.setReplacement} onPreview={() => void controller.previewReplace()} onApply={() => void applyReplacement()} />
    {/if}
    {#if $search.excludedCount}
      <div class="excluded"><span>{$_('workspace_search.excluded', { values: { count: $search.excludedCount } })}</span>
        <button type="button" disabled={locked} onclick={controller.restore}>{$_('workspace_search.restore_results')}</button></div>
    {/if}
    <p class="scope-hint">{$_('workspace_search.scope_hint')}</p>
  </header>
  {#if $search.error || navigationError}
    <p class="error" role="alert">{['draftBlocked', 'changed', 'replacementPartial'].includes($search.error) ? $_(`workspace_search.${$search.error}`) : $search.error || navigationError}</p>
  {/if}
  <div class="results" aria-busy={$search.busy}>
    {#if $search.busy}
      <p class="empty" role="status">{$_('workspace_search.searching')}</p>
    {:else if $search.result}
      {#if $search.result.limited}<p class="notice">{$_('workspace_search.limited')}</p>{/if}
      {#if $search.result.warnings.length}
        <details class="warnings"><summary>{$_('workspace_search.warnings')}</summary>{#each $search.result.warnings as warning}<p>{warning}</p>{/each}</details>
      {/if}
      {#if $search.searchCards}<SearchResults groups={$search.result.cards} disabled={locked} onOpen={openResult} onContextMenu={openResultMenu} onExclude={controller.exclude} {previewEdits} />{/if}
      {#if $search.searchScripts}<SearchResults groups={$search.result.scripts} scripts disabled={locked} onOpen={openResult} onContextMenu={openResultMenu} onExclude={controller.exclude} {previewEdits} />{/if}
    {:else}<p class="empty">{$_('workspace_search.initial')}</p>{/if}
  </div>
</section>

<style>
  .search-surface { height: 100%; display: flex; flex-direction: column; min-height: 0; background: var(--bg-base); }
  header { padding: 18px 20px 12px; border-bottom: 1px solid var(--border-color); background: var(--bg-surface); }
  .heading { display: flex; align-items: baseline; gap: 16px; margin-bottom: 14px; }
  h2 { margin: 0; font-size: var(--text-lg); font-weight: 600; }
  .heading span { color: var(--text-disabled); font-size: var(--text-sm); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .query-row { display: flex; gap: 6px; }
  input[type='search'] { flex: 1; min-width: 90px; padding: 8px 10px; }
  button { padding: 7px 10px; border: 1px solid var(--border-color); border-radius: var(--control-radius); }
  button:hover { background: var(--bg-surface-hover); }
  .option.active { border-color: var(--accent-primary); color: var(--accent-primary); background: var(--accent-soft-bg); }
  .search-button { background: var(--accent-primary); border-color: var(--accent-primary); color: var(--text-on-accent); }
  button:disabled { opacity: .45; cursor: default; }
  .scope-row { display: flex; align-items: center; gap: 18px; margin-top: 12px; font-size: var(--text-sm); color: var(--text-secondary); }
  label { display: flex; align-items: center; gap: 6px; cursor: pointer; }
  input[type='checkbox'] { accent-color: var(--accent-primary); }
  .scope-row > span { margin-left: auto; color: var(--text-disabled); }
  .scope-hint { margin: 10px 0 0; font-size: var(--text-xs); color: var(--text-disabled); line-height: 1.5; }
  .excluded { display: flex; align-items: center; gap: 10px; margin-top: 10px; color: var(--text-secondary); font-size: var(--text-xs); }
  .excluded button { padding: 3px 8px; }
  .results { flex: 1; min-height: 0; overflow: auto; }
  .empty { margin: 0; padding: 48px 24px; text-align: center; color: var(--text-disabled); }
  .error, .notice, .warnings { margin: 12px 16px; padding: 10px 12px; border: 1px solid var(--border-color); border-radius: var(--control-radius); font-size: var(--text-sm); overflow-wrap: anywhere; }
  .error { color: var(--state-danger-fg); }
  .notice, .warnings { color: var(--state-warning-fg); }
  @media (max-width: 850px) { header { padding: 12px; } .query-row { flex-wrap: wrap; } .scope-row { gap: 10px; } }
</style>
