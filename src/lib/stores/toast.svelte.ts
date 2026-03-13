export interface ToastItem {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

let nextId = 0;
export const toasts = $state<ToastItem[]>([]);

export function showToast(message: string, type: ToastItem['type'] = 'info', duration = 2500) {
  const id = nextId++;
  toasts.push({ id, message, type });
  setTimeout(() => {
    const idx = toasts.findIndex(t => t.id === id);
    if (idx !== -1) toasts.splice(idx, 1);
  }, duration);
}
