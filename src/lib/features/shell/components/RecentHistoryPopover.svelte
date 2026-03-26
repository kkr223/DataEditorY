<script lang="ts">
  import { _ } from 'svelte-i18n';
  import type { RecentCdbEntry } from '$lib/stores/db';

  let {
    visible = false,
    entries = [],
    onOpen = async (_path: string) => {},
    onRemove = (_path: string) => {},
    onHideImmediately = () => {},
  }: {
    visible?: boolean;
    entries?: RecentCdbEntry[];
    onOpen?: (path: string) => void | Promise<void>;
    onRemove?: (path: string) => void;
    onHideImmediately?: () => void;
  } = $props();
</script>

<div class="open-history-popover" class:visible role="menu" aria-label={$_('nav.open_recent')}>
  <div class="open-history-header">{$_('nav.open_recent')}</div>
  {#if entries.length > 0}
    {#each entries as entry (entry.path)}
      <div class="open-history-row">
        <button
          class="open-history-item"
          type="button"
          onclick={() => { onHideImmediately(); void onOpen(entry.path); }}
          title={entry.path}
        >
          <span class="open-history-name">{entry.name}</span>
          <span class="open-history-path">{entry.path}</span>
        </button>
        <button
          class="open-history-remove"
          type="button"
          aria-label={$_('nav.open_recent_remove')}
          title={$_('nav.open_recent_remove')}
          onclick={(event) => { event.stopPropagation(); onRemove(entry.path); }}
        >
          ×
        </button>
      </div>
    {/each}
  {:else}
    <div class="open-history-empty">{$_('nav.open_recent_empty')}</div>
  {/if}
</div>

<style>
  .open-history-popover {
    position: absolute;
    top: calc(100% + 2px);
    left: 0;
    min-width: min(440px, 68vw);
    max-width: min(520px, 78vw);
    padding: 10px;
    border: 1px solid var(--border-color);
    border-radius: 14px;
    background: color-mix(in srgb, var(--bg-surface) 92%, var(--bg-base));
    box-shadow: 0 18px 40px rgba(0, 0, 0, 0.24);
    display: flex;
    flex-direction: column;
    gap: 6px;
    opacity: 0;
    visibility: hidden;
    transform: translateY(-6px);
    transition: opacity 0.18s ease, transform 0.18s ease, visibility 0.18s ease;
    pointer-events: none;
    z-index: 80;
  }

  .open-history-popover::before {
    content: '';
    position: absolute;
    top: -7px;
    left: 22px;
    width: 12px;
    height: 12px;
    border-top: 1px solid var(--border-color);
    border-left: 1px solid var(--border-color);
    background: inherit;
    transform: rotate(45deg);
  }

  .open-history-popover.visible {
    opacity: 1;
    visibility: visible;
    transform: translateY(0);
    pointer-events: auto;
  }

  .open-history-header {
    padding: 2px 6px 8px;
    color: var(--text-secondary);
    font-size: 0.78rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .open-history-row {
    position: relative;
  }

  .open-history-item {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    width: 100%;
    min-width: 0;
    padding: 10px 42px 10px 12px;
    border: 1px solid transparent;
    border-radius: 10px;
    background: transparent;
    color: var(--text-primary);
    text-align: left;
    cursor: pointer;
    transition: background-color 0.16s ease, border-color 0.16s ease;
    font-family: inherit;
  }

  .open-history-item:hover {
    background: var(--bg-surface-hover);
    border-color: var(--border-color);
  }

  .open-history-remove {
    position: absolute;
    top: -4px;
    right: -4px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border: 1px solid var(--border-color);
    border-radius: 999px;
    background: var(--bg-surface);
    color: var(--text-secondary);
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.16);
    transition: transform 0.16s ease, background-color 0.16s ease, color 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease;
    font: inherit;
    font-size: 0.72rem;
    font-weight: 700;
    line-height: 1;
    z-index: 1;
  }

  .open-history-remove:hover {
    background: var(--bg-surface-hover);
    border-color: color-mix(in srgb, var(--text-secondary) 28%, var(--border-color));
    color: var(--text-primary);
    transform: scale(1.08);
    box-shadow: 0 6px 14px rgba(0, 0, 0, 0.2);
  }

  .open-history-name {
    font-size: 0.92rem;
    font-weight: 600;
  }

  .open-history-path,
  .open-history-empty {
    color: var(--text-secondary);
    font-size: 0.78rem;
    line-height: 1.4;
    word-break: break-all;
  }

  .open-history-empty {
    padding: 6px 8px 4px;
  }
</style>
