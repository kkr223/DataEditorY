<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { closeContextMenu, contextMenuState, runMenuItem } from './menu.svelte';

  let host = $state<HTMLDivElement>();
  let x = $state(0);
  let y = $state(0);
  const token = $derived(contextMenuState.current?.token);
  $effect(() => {
    if (!token) return;
    const menu = untrack(() => contextMenuState.current);
    if (!menu) return;
    x = menu.x;
    y = menu.y;
    void tick().then(() => {
      if (contextMenuState.current?.token !== menu.token || !host) return;
      const bounds = host.getBoundingClientRect();
      x = Math.max(6, Math.min(menu.x, window.innerWidth - bounds.width - 6));
      y = Math.max(6, Math.min(menu.y, window.innerHeight - bounds.height - 6));
      host.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
    });
  });

  function keydown(event: KeyboardEvent) {
    if (!contextMenuState.current) return;
    event.stopPropagation();
    if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      closeContextMenu(true);
      return;
    }
    const buttons = [...(host?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
    if (!buttons.length) return;
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'ArrowDown' ? (index + 1) % buttons.length
      : event.key === 'ArrowUp' ? (index - 1 + buttons.length) % buttons.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : -1;
    if (next < 0) return;
    event.preventDefault();
    buttons[next].focus();
  }

  function outside(event: PointerEvent) {
    if (contextMenuState.current && !host?.contains(event.target as Node)) closeContextMenu();
  }
</script>

<svelte:window onpointerdown={outside} onresize={() => closeContextMenu()} onblur={() => closeContextMenu()} />

{#if contextMenuState.current}
  <div class="context-menu" bind:this={host} role="menu" tabindex="-1"
    style:left={`${x}px`} style:top={`${y}px`} onkeydown={keydown}
    oncontextmenu={(event) => event.preventDefault()}>
    {#each contextMenuState.current.items as item, index (item?.id ?? `separator-${index}`)}
      {#if item}
        <button type="button" role="menuitem" disabled={item.disabled} class:danger={item.danger}
          onclick={() => void runMenuItem(item)}>
          <span>{item.label}</span>{#if item.shortcut}<kbd>{item.shortcut}</kbd>{/if}
        </button>
      {:else}
        <div class="separator" role="separator"></div>
      {/if}
    {/each}
  </div>
{/if}

<style>
  .context-menu { position: fixed; z-index: 10000; min-width: 218px; max-width: calc(100vw - 12px); max-height: calc(100vh - 12px); overflow-y: auto; padding: 5px; border: 1px solid var(--border-color); border-radius: var(--control-radius-soft, 8px); background: var(--bg-surface); color: var(--text-primary); box-shadow: var(--shadow-popover, 0 8px 30px #0004); }
  button { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 26px; padding: 7px 10px; border: 0; border-radius: var(--control-radius, 4px); background: transparent; color: inherit; font: inherit; font-size: 0.88rem; text-align: left; cursor: pointer; }
  button:hover:not(:disabled), button:focus-visible { background: var(--bg-surface-hover); outline: none; }
  button:focus-visible { box-shadow: inset 0 0 0 1px var(--accent-primary); }
  button:disabled { opacity: .4; cursor: default; }
  button.danger { color: var(--state-danger-fg, #e66); }
  kbd { color: var(--text-secondary); font: inherit; font-size: .78rem; }
  .separator { height: 1px; margin: 4px 5px; background: var(--border-color); }
</style>
