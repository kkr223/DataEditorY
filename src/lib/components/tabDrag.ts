import type { DocumentPlacement } from '$lib/platform/runtime';

type TabDragOptions = {
  id: string;
  scope: string;
  enabled?: boolean;
  onMove: (id: string, targetId: string, placement: DocumentPlacement) => void;
};

// Pointer dragging also works in Tauri windows that reserve native file drops.
export const tabDrag = (node: HTMLElement, initial: TabDragOptions) => {
  let options = initial;
  let cancel = () => {};
  let suppressClick = false;
  const syncAttributes = () => {
    if (options.enabled === false) {
      delete node.dataset.tabDragId;
      delete node.dataset.tabDragScope;
      return;
    }
    node.dataset.tabDragId = options.id;
    node.dataset.tabDragScope = options.scope;
  };

  const onPointerDown = (down: PointerEvent) => {
    if (options.enabled === false || down.button !== 0 || !down.isPrimary) return;
    cancel();
    suppressClick = false;
    if ((down.target as Element).closest('[data-tab-close]')) return;
    const strip = node.parentElement;
    if (!strip) return;
    let dragging = false;
    let clientX = down.clientX;
    let clientY = down.clientY;
    let frame = 0;
    let target: HTMLElement | null = null;
    let placement: DocumentPlacement = 'before';
    const siblings = () => Array.from(strip.querySelectorAll<HTMLElement>('[data-tab-drag-id]'))
      .filter((item) => item !== node && item.dataset.tabDragScope === options.scope);

    const clearTarget = () => {
      if (target) delete target.dataset.tabDrop;
      target = null;
    };
    const updateTarget = () => {
      clearTarget();
      const bounds = strip.getBoundingClientRect();
      if (clientY < bounds.top - 12 || clientY > bounds.bottom + 12
        || clientX < bounds.left - 24 || clientX > bounds.right + 24) return;
      const candidates = siblings();
      target = candidates.find((item) => {
        const rect = item.getBoundingClientRect();
        return clientX < rect.left + rect.width / 2;
      }) ?? candidates.at(-1) ?? null;
      if (!target) return;
      const rect = target.getBoundingClientRect();
      placement = clientX < rect.left + rect.width / 2 ? 'before' : 'after';
      target.dataset.tabDrop = placement;
    };
    const scroll = () => {
      const bounds = strip.getBoundingClientRect();
      if (clientY >= bounds.top - 12 && clientY <= bounds.bottom + 12
        && clientX >= bounds.left - 24 && clientX <= bounds.right + 24) {
        const edge = Math.min(36, bounds.width / 4);
        const delta = clientX < bounds.left + edge ? -Math.min(16, (bounds.left + edge - clientX) / 2)
          : clientX > bounds.right - edge ? Math.min(16, (clientX - bounds.right + edge) / 2) : 0;
        if (delta) {
          strip.scrollLeft += delta;
          updateTarget();
        }
      }
      frame = requestAnimationFrame(scroll);
    };
    const finish = () => {
      cancelAnimationFrame(frame);
      clearTarget();
      delete node.dataset.tabDragging;
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', cancelled, true);
      window.removeEventListener('blur', finish);
      window.removeEventListener('keydown', keydown, true);
      if (node.hasPointerCapture(down.pointerId)) node.releasePointerCapture(down.pointerId);
      cancel = () => {};
    };
    const move = (event: PointerEvent) => {
      if (event.pointerId !== down.pointerId) return;
      clientX = event.clientX;
      clientY = event.clientY;
      if (!dragging && Math.hypot(clientX - down.clientX, clientY - down.clientY) < 5) return;
      if (!dragging) {
        dragging = true;
        suppressClick = true;
        node.dataset.tabDragging = '';
        node.setPointerCapture(down.pointerId);
        frame = requestAnimationFrame(scroll);
      }
      event.preventDefault();
      updateTarget();
    };
    const up = (event: PointerEvent) => {
      if (event.pointerId !== down.pointerId) return;
      if (dragging) {
        clientX = event.clientX;
        clientY = event.clientY;
        updateTarget();
      }
      const targetId = target?.dataset.tabDragId;
      finish();
      if (dragging && targetId) options.onMove(options.id, targetId, placement);
    };
    const cancelled = (event: PointerEvent) => {
      if (event.pointerId === down.pointerId) finish();
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      finish();
    };
    cancel = finish;
    window.addEventListener('pointermove', move, { capture: true, passive: false });
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', cancelled, true);
    window.addEventListener('blur', finish);
    window.addEventListener('keydown', keydown, true);
  };
  const onClick = (event: MouseEvent) => {
    if (!suppressClick || event.detail === 0) return;
    suppressClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const onDragStart = (event: DragEvent) => event.preventDefault();
  syncAttributes();
  node.addEventListener('pointerdown', onPointerDown);
  node.addEventListener('click', onClick, true);
  node.addEventListener('dragstart', onDragStart);
  return {
    update(next: TabDragOptions) {
      if (next.id !== options.id || next.scope !== options.scope || next.enabled === false) cancel();
      options = next;
      syncAttributes();
    },
    destroy() {
      cancel();
      node.removeEventListener('pointerdown', onPointerDown);
      node.removeEventListener('click', onClick, true);
      node.removeEventListener('dragstart', onDragStart);
      delete node.dataset.tabDragId;
      delete node.dataset.tabDragScope;
    },
  };
};
