<script lang="ts">
  import { _ } from 'svelte-i18n';
  import type { WorkspaceSearchGroup, WorkspaceSearchMatch } from './types';
  let { groups, scripts = false, disabled = false, onOpen, onContextMenu }: {
    groups: WorkspaceSearchGroup[];
    scripts?: boolean;
    disabled?: boolean;
    onOpen: (group: WorkspaceSearchGroup, match: WorkspaceSearchMatch) => void;
    onContextMenu: (event: MouseEvent, group: WorkspaceSearchGroup, match?: WorkspaceSearchMatch) => void;
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
      </summary>
      {#each group.matches as match}
        <button type="button" class="match" {disabled} onclick={() => onOpen(group, match)}
          oncontextmenu={(event) => onContextMenu(event, group, match)}
          title={`${$_('workspace_search.open_result')} · ${group.path ?? group.cardId}:${match.line}:${match.column}`}>
          <span class="location">{scripts ? `${match.line}:${match.column}` : `${match.field}:${match.line}`}</span>
          <code>{match.before}<mark>{match.matched || '│'}</mark>{match.after}</code>
        </button>
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
  summary:hover, .match:hover { background: var(--bg-surface-hover); }
  .kind { color: var(--accent-primary); font-size: var(--text-2xs); font-family: var(--font-mono); }
  strong { font-size: var(--text-sm); font-weight: 600; }
  .name { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: var(--text-sm); color: var(--text-secondary); }
  .count { margin-left: auto; }
  .match { display: flex; align-items: baseline; gap: 16px; width: 100%; padding: 7px 18px 7px 38px; text-align: left; cursor: pointer; }
  .match:disabled { opacity: .6; cursor: wait; }
  .location { flex: 0 0 94px; color: var(--text-disabled); font: var(--text-xs) var(--font-mono); }
  code { overflow: hidden; text-overflow: ellipsis; white-space: pre; color: var(--text-secondary); font: var(--text-sm)/1.6 var(--font-mono); }
  mark { color: var(--text-primary); background: color-mix(in srgb, var(--state-warning-fg) 26%, transparent); border-bottom: 1px solid var(--state-warning-fg); }
  p { padding: 14px 18px; color: var(--text-disabled); font-size: var(--text-sm); }
  @media (max-width: 850px) { .match { padding-left: 16px; gap: 8px; } .location { flex-basis: 76px; } }
</style>
