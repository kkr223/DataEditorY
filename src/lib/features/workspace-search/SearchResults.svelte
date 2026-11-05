<script lang="ts">
  import { _ } from 'svelte-i18n';
  import type { WorkspaceSearchGroup, WorkspaceSearchMatch } from './types';
  import { replacementKey, replacementTarget } from './results';
  let { groups, scripts = false, disabled = false, onOpen, onContextMenu, onExclude, previewEdits }: {
    groups: WorkspaceSearchGroup[];
    scripts?: boolean;
    disabled?: boolean;
    onOpen: (group: WorkspaceSearchGroup, match: WorkspaceSearchMatch) => void;
    onContextMenu: (event: MouseEvent, group: WorkspaceSearchGroup, match?: WorkspaceSearchMatch) => void;
    onExclude: (group: WorkspaceSearchGroup, match?: WorkspaceSearchMatch) => void;
    previewEdits: Map<string, string>;
  } = $props();
</script>

<section aria-label={$_(scripts ? 'workspace_search.scripts' : 'workspace_search.cards')}>
  <h3>{$_(scripts ? 'workspace_search.scripts' : 'workspace_search.cards')} <span>{groups.length}</span></h3>
  {#each groups as group (group.cardId)}
    <details open>
      <summary tabindex="0" title={group.path ?? group.cardName} oncontextmenu={(event) => onContextMenu(event, group)}>
        <span class="kind">{scripts ? 'LUA' : 'CDB'}</span>
        <strong>{scripts ? `c${group.cardId}.lua` : group.cardId}</strong>
        <span class="name">{group.cardName}</span><span class="count">{group.matches.length}</span>
        <button type="button" class="dismiss" {disabled} aria-label={$_('workspace_search.exclude_group')}
          title={$_('workspace_search.exclude_group')}
          onclick={(event) => { event.preventDefault(); event.stopPropagation(); onExclude(group); }}>×</button>
      </summary>
      {#each group.matches as match}
        {@const replacement = previewEdits.get(replacementKey(replacementTarget(group, match)))}
        <div class="match-row">
        <button type="button" class="match" {disabled} onclick={() => onOpen(group, match)}
          oncontextmenu={(event) => onContextMenu(event, group, match)}
          title={`${$_('workspace_search.open_result')} · ${group.path ?? group.cardId}:${match.line}:${match.column}`}>
          <span class="location">{scripts ? `${match.line}:${match.column}` : `${match.field}:${match.line}`}</span>
          <span class="match-text">
            <code class:before={replacement !== undefined}>{match.before}<mark>{match.matched || '│'}</mark>{match.after}</code>
            {#if replacement !== undefined}<code class="after">{match.before}<ins>{replacement || '∅'}</ins>{match.after}</code>{/if}
          </span>
        </button>
        <button type="button" class="dismiss" {disabled} aria-label={$_('workspace_search.exclude_match')}
          title={$_('workspace_search.exclude_match')} onclick={() => onExclude(group, match)}>×</button>
        </div>
      {/each}
    </details>
  {/each}
  {#if groups.length === 0}<p>{$_('workspace_search.no_matches')}</p>{/if}
</section>

<style>
  section { min-width: 0; }
  h3 { display: flex; align-items: center; gap: 9px; padding: 12px 16px; margin: 0; font-size: var(--text-sm); color: var(--text-secondary); border-bottom: 1px solid var(--border-color); background: var(--bg-surface); }
  h3 span, .count { color: var(--text-disabled); font-size: var(--text-xs); font-variant-numeric: tabular-nums; }
  details { border-bottom: 1px solid color-mix(in srgb, var(--border-color) 55%, transparent); }
  summary { display: flex; align-items: center; gap: 9px; padding: 9px 16px; cursor: pointer; min-width: 0; }
  summary::before { content: '›'; color: var(--text-secondary); }
  details[open] summary::before { content: '⌄'; }
  summary:hover, .match-row:hover { background: var(--bg-surface-hover); }
  .kind { color: var(--accent-primary); font-size: var(--text-2xs); font-family: var(--font-mono); }
  strong { font-size: var(--text-sm); font-weight: 600; }
  .name { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: var(--text-sm); color: var(--text-secondary); }
  .count { margin-left: auto; }
  .match-row { display: flex; align-items: center; padding-right: 12px; }
  .match { display: flex; align-items: baseline; flex: 1; min-width: 0; gap: 16px; padding: 7px 8px 7px 38px; text-align: left; cursor: pointer; }
  .match:disabled { opacity: .6; cursor: wait; }
  .location { flex: 0 0 94px; color: var(--text-disabled); font: var(--text-xs) var(--font-mono); }
  .match-text { min-width: 0; }
  code { display: block; overflow: hidden; text-overflow: ellipsis; white-space: pre; color: var(--text-secondary); font: var(--text-sm)/1.6 var(--font-mono); }
  .before mark { background: color-mix(in srgb, var(--state-danger-fg) 18%, transparent); text-decoration: line-through; }
  ins { color: var(--text-primary); background: color-mix(in srgb, var(--accent-primary) 22%, transparent); text-decoration: none; }
  .dismiss { flex: 0 0 24px; width: 24px; height: 24px; border-radius: var(--control-radius); color: var(--text-secondary); cursor: pointer; font-size: 18px; }
  .dismiss:hover, .dismiss:focus-visible { color: var(--text-primary); background: var(--bg-surface-hover); }
  .dismiss:disabled { opacity: .35; cursor: default; }
  mark { color: var(--text-primary); background: color-mix(in srgb, var(--state-warning-fg) 26%, transparent); border-bottom: 1px solid var(--state-warning-fg); }
  p { padding: 14px 18px; color: var(--text-disabled); font-size: var(--text-sm); }
  @media (max-width: 850px) { .match { padding-left: 16px; gap: 8px; } .location { flex-basis: 76px; } }
</style>
