<script lang="ts">
  import { _ } from 'svelte-i18n';

  type CategoryOption = {
    bit: number;
  };

  let {
    value = 0,
    title = '',
    buttonLabel = '',
    onChange = () => {},
  }: {
    value?: number;
    title?: string;
    buttonLabel?: string;
    onChange?: (value: number) => void;
  } = $props();

  let isOpen = $state(false);
  let popoverEl = $state<HTMLElement | null>(null);
  let hostEl = $state<HTMLElement | null>(null);

  const CATEGORY_OPTIONS: CategoryOption[] = [
    { bit: 0x1 },
    { bit: 0x2 },
    { bit: 0x4 },
    { bit: 0x8 },
    { bit: 0x10 },
    { bit: 0x20 },
    { bit: 0x40 },
    { bit: 0x80 },
    { bit: 0x100 },
    { bit: 0x200 },
    { bit: 0x400 },
    { bit: 0x800 },
    { bit: 0x1000 },
    { bit: 0x2000 },
    { bit: 0x4000 },
    { bit: 0x8000 },
    { bit: 0x10000 },
    { bit: 0x20000 },
    { bit: 0x40000 },
    { bit: 0x80000 },
    { bit: 0x100000 },
    { bit: 0x200000 },
    { bit: 0x400000 },
    { bit: 0x800000 },
    { bit: 0x1000000 },
    { bit: 0x2000000 },
    { bit: 0x4000000 },
    { bit: 0x8000000 },
    { bit: 0x10000000 },
    { bit: 0x20000000 },
    { bit: 0x40000000 },
    { bit: 0x80000000 },
  ];

  let selectedCount = $derived(CATEGORY_OPTIONS.filter((option) => hasCategory(option.bit)).length);

  function hasCategory(bit: number) {
    return Math.floor(Math.max(0, value) / bit) % 2 >= 1;
  }

  function toggleCategory(bit: number) {
    const next = hasCategory(bit) ? Math.max(0, value - bit) : value + bit;
    onChange(next);
  }

  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return {
      destroy() {
        if (node.parentNode) node.parentNode.removeChild(node);
      },
    };
  }

  function updatePopoverPosition() {
    const popover = popoverEl;
    const host = hostEl;
    if (!popover || !host) return;
    const hostRect = host.getBoundingClientRect();
    const viewWidth = window.innerWidth;
    const viewHeight = window.innerHeight;

    // 先重置位置以获取 popover 真实尺寸
    popover.style.visibility = 'hidden';
    popover.style.right = '0px';
    popover.style.bottom = '0px';
    const popoverWidth = popover.offsetWidth;
    const popoverHeight = popover.offsetHeight;

    // 尽量放在按钮上方，右边对齐宿主右边缘
    let left = hostRect.right - popoverWidth;
    let top = hostRect.top - popoverHeight - 8;

    // 如果上方空间不足，放到按钮下方
    if (top < 8) {
      top = hostRect.bottom + 8;
    }

    // 限制不超出屏幕右边缘
    if (left + popoverWidth > viewWidth - 8) {
      left = viewWidth - popoverWidth - 8;
    }
    if (left < 8) left = 8;

    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
    popover.style.right = 'auto';
    popover.style.bottom = 'auto';
    popover.style.position = 'fixed';
    popover.style.visibility = 'visible';
  }

  $effect(() => {
    if (isOpen && hostEl && popoverEl) {
      requestAnimationFrame(() => {
        updatePopoverPosition();
      });
    }
  });

  function clickOutside(node: HTMLElement, callback: () => void) {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (
        node &&
        !node.contains(target) &&
        !hostEl?.contains(target) &&
        document.body.contains(target)
      ) {
        callback();
      }
    }
    document.addEventListener('click', handleClick, true);
    return {
      destroy() {
        document.removeEventListener('click', handleClick, true);
      },
    };
  }

  function closePopover() {
    isOpen = false;
  }
</script>

<div class="category-popover-host" bind:this={hostEl}>
  {#if isOpen}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="category-popover"
      role="dialog"
      aria-label={title}
      bind:this={popoverEl}
      use:portal
      use:clickOutside={closePopover}
    >
      <div class="category-popover-header">
        <strong>{title}</strong>
      </div>
      <div class="category-grid">
        {#each CATEGORY_OPTIONS as option (option.bit)}
          <label class="category-option">
            <input
              type="checkbox"
              checked={hasCategory(option.bit)}
              onchange={() => toggleCategory(option.bit)}
            />
            <span>{$_('editor.categories.0x' + option.bit.toString(16))}</span>
          </label>
        {/each}
      </div>
    </div>
  {/if}

  <button
    type="button"
    class:active={isOpen || selectedCount > 0}
    class="category-trigger"
    title={buttonLabel}
    aria-label={buttonLabel}
    aria-expanded={isOpen}
    onclick={() => {
      isOpen = !isOpen;
    }}
  >
    <span>fx</span>
    {#if selectedCount > 0}
      <small>{selectedCount}</small>
    {/if}
  </button>
</div>

<style>
  .category-popover-host {
    display: flex;
    justify-content: flex-end;
    padding: 4px 0 0;
    z-index: 8;
  }

  .category-trigger {
    width: 34px;
    height: 34px;
    border-radius: 999px;
    border: 1px solid var(--border-color);
    background: color-mix(in srgb, var(--bg-surface) 96%, transparent);
    color: var(--text-secondary);
    display: grid;
    place-items: center;
    cursor: pointer;
    box-shadow: var(--shadow-popover);
    font-weight: 800;
    font-size: 0.76rem;
    position: relative;
  }

  .category-trigger:hover,
  .category-trigger.active {
    color: var(--text-primary);
    border-color: var(--accent-primary);
    background: color-mix(in srgb, var(--accent-primary) 18%, var(--bg-surface));
  }

  .category-trigger small {
    position: absolute;
    min-width: 16px;
    height: 16px;
    border-radius: 999px;
    right: -4px;
    top: -5px;
    display: grid;
    place-items: center;
    padding: 0 4px;
    background: var(--accent-primary);
    color: white;
    font-size: 0.62rem;
    line-height: 1;
  }

  .category-popover {
    position: absolute;
    z-index: 9999;
    width: min(560px, calc(100vw - 36px));
    max-height: min(430px, calc(100vh - 160px));
    overflow: auto;
    border: 1px solid var(--border-color);
    border-radius: var(--control-radius);
    background: var(--bg-surface);
    box-shadow: var(--shadow-popover);
    padding: 10px;
  }

  .category-popover-header {
    padding: 0 2px 8px;
    border-bottom: 1px solid var(--border-color);
  }

  .category-popover-header strong {
    color: var(--text-primary);
    font-size: 0.86rem;
  }

  .category-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px 10px;
    padding-top: 10px;
  }

  .category-option {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    color: var(--text-primary);
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
    user-select: none;
  }

  .category-option input {
    width: auto;
    accent-color: var(--accent-primary);
    flex: 0 0 auto;
  }

  .category-option span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (max-width: 900px) {
    .category-popover {
      width: min(390px, calc(100vw - 28px));
    }

    .category-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
