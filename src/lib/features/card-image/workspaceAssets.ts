import { readImageFile } from '$lib/native/assetApi';
import { toMediaProtocolSrc } from '$lib/utils/mediaProtocol';

const WORKSPACE_ASSET_PREFIX = 'workspace-asset:';
const WORKSPACE_ASSET_PATTERN = /^workspace-asset:(card-image\/\d+\/(?:art|foreground)\.(png|jpg|webp|gif|bmp))$/;

export function parseWorkspaceCardImageAssetReference(value: string) {
  const match = value.match(WORKSPACE_ASSET_PATTERN);
  if (!match) return null;
  return {
    parts: match[1].split('/'),
    mimeType: match[2] === 'jpg' ? 'image/jpeg' : `image/${match[2]}`,
  };
}

function resolveWorkspaceCardImageAssetPath(cdbPath: string, reference: string) {
  if (!cdbPath.trim()) return null;
  const parsed = parseWorkspaceCardImageAssetReference(reference);
  if (!parsed) return null;
  const separator = cdbPath.includes('\\') ? '\\' : '/';
  const lastSeparator = Math.max(cdbPath.lastIndexOf('/'), cdbPath.lastIndexOf('\\'));
  if (lastSeparator < 0) return null;
  const parent = cdbPath.slice(0, lastSeparator);
  return [parent, '.dey', ...parsed.parts].join(separator);
}

export function resolveWorkspaceCardImageAssetSrc(cdbPath: string, value: string) {
  const path = resolveWorkspaceCardImageAssetPath(cdbPath, value);
  return path ? toMediaProtocolSrc(path) : value;
}

export async function inlineWorkspaceCardImageAsset(cdbPath: string, value: string) {
  const parsed = parseWorkspaceCardImageAssetReference(value);
  const path = parsed ? resolveWorkspaceCardImageAssetPath(cdbPath, value) : null;
  if (!parsed || !path) return value;
  const blob = new Blob([new Uint8Array(await readImageFile(path))], { type: parsed.mimeType });
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Workspace image read failed'));
    reader.readAsDataURL(blob);
  });
}

export function isWorkspaceCardImageAssetReference(value: string) {
  return value.startsWith(WORKSPACE_ASSET_PREFIX)
    && parseWorkspaceCardImageAssetReference(value) !== null;
}
