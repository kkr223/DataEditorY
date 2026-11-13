import { tauriBridge } from '#lib/infrastructure/tauri/index.ts';

export const MEDIA_PROTOCOL = 'app-media';

export function toMediaProtocolSrc(path: string, revision?: number): string {
  if (!path || !tauriBridge.isTauri()) {
    return path;
  }

  const base = tauriBridge.convertFileSrc(path, MEDIA_PROTOCOL);
  if (revision === undefined) {
    return base;
  }

  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}v=${revision}`;
}
