import { tauriHost } from './tauri.ts';

/**
 * Active host. The web build replaces this module with a browser host; all
 * other code depends on the `HostAdapter` interface only.
 */
export const host = tauriHost;

export type {
  HostAdapter,
  HostDragPayload,
  HostEventMap,
  HostEventName,
  HostFileFilter,
  HostKind,
  HostMessageOptions,
  HostOpenOptions,
  HostSaveOptions,
  HostUnlisten,
  HostWindowCloseEvent,
} from './types.ts';
