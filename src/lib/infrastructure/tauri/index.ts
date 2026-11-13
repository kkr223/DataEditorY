import { convertFileSrc, invoke, isTauri } from '@tauri-apps/api/core';
import { listen, TauriEvent } from '@tauri-apps/api/event';
import { appConfigDir, dirname, join, resolveResource } from '@tauri-apps/api/path';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { ask, message, open, save } from '@tauri-apps/plugin-dialog';

export function invokeCommand<T>(command: string, args?: Record<string, unknown>) {
  return invoke<T>(command, args);
}

export const tauriBridge = {
  appConfigDir,
  ask,
  convertFileSrc,
  dirname,
  getCurrentWindow,
  isTauri,
  join,
  listen,
  message,
  open,
  resolveResource,
  save,
  TauriEvent,
};
