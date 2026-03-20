import { convertFileSrc, isTauri } from '@tauri-apps/api/core';

export const MEDIA_PROTOCOL = 'app-media';

export function toMediaProtocolSrc(path: string, revision?: number): string {
  if (!path || !isTauri()) {
    return path;
  }

  const base = convertFileSrc(path, MEDIA_PROTOCOL);
  if (revision === undefined) {
    return base;
  }

  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}v=${revision}`;
}
