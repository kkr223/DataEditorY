import { showToast } from '$lib/stores/toast.svelte';

export type ContextMenuItem = {
  id: string;
  label: string;
  disabled?: boolean;
  danger?: boolean;
  shortcut?: string;
  action: () => unknown | Promise<unknown>;
} | null;

type Menu = { token: symbol; x: number; y: number; items: ContextMenuItem[]; owner: HTMLElement | null };
export const contextMenuState = $state<{ current: Menu | null }>({ current: null });

export function openContextMenu(event: MouseEvent, items: ContextMenuItem[]) {
  event.preventDefault();
  event.stopPropagation();
  const target = event.target instanceof Element ? event.target : null;
  const owner = target?.closest<HTMLElement>('button, input, textarea, [tabindex="0"], [contenteditable="true"]')
    ?? document.activeElement as HTMLElement | null;
  const bounds = owner?.getBoundingClientRect();
  const token = Symbol('context-menu');
  contextMenuState.current = {
    token, items, owner,
    x: event.clientX || bounds?.left || 0,
    y: event.clientY || bounds?.bottom || 0,
  };
  return token;
}

export function updateContextMenu(token: symbol, items: ContextMenuItem[]) {
  if (contextMenuState.current?.token !== token) return;
  contextMenuState.current = { ...contextMenuState.current, items };
}

export function closeContextMenu(restoreFocus = false) {
  const owner = contextMenuState.current?.owner;
  contextMenuState.current = null;
  if (restoreFocus && owner?.isConnected) owner.focus({ preventScroll: true });
}

export async function runMenuItem(item: ContextMenuItem) {
  if (!item || item.disabled) return;
  closeContextMenu(true);
  try {
    await item.action();
  } catch (error) {
    showToast(String(error), 'error');
  }
}
