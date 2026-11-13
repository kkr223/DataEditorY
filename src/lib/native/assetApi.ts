import { host } from '#lib/platform/host/index.ts';
import { fetchBundledText } from '#lib/core/bundledResources.ts';

export type LuaHelperScript = {
  name: string;
  path: string;
  content: string;
};

export type AssetCheckMissingItem = {
  cardId: number;
  imageMissing: boolean;
  scriptMissing: boolean;
};

export type AssetCheckResponse = {
  checked: number;
  missingImages: number;
  missingScripts: number;
  missing: AssetCheckMissingItem[];
};

function desktopCommands() {
  return import('#lib/infrastructure/tauri/commands.ts');
}

export function readCdbFile(path: string) {
  return host.fs.readBinary(path);
}

export function readImageFile(path: string) {
  return host.fs.readBinary(path);
}

export function writeBinaryFile(path: string, data: Uint8Array) {
  return host.fs.writeBinary(path, data);
}

export function writeTextFile(path: string, content: string) {
  return host.fs.writeText(path, content);
}

export function readTextFile(path: string) {
  return host.fs.readText(path);
}

export function pathExists(path: string) {
  return host.fs.exists(path);
}

export function listImageFolderEntries(path: string) {
  return host.fs.listDirectory(path);
}

export async function resolveResourceFile(relativePath: string) {
  return host.media.resolveResource(relativePath);
}

export async function loadStringsConfContent() {
  if (host.kind === 'web') {
    return fetchBundledText('strings/strings.conf');
  }
  return (await desktopCommands()).loadStringsConfContent();
}

export async function importCardImageFile(input: {
  src: string;
  dest: string;
  maxWidth: number;
  maxHeight: number;
  quality: number;
}) {
  if (host.kind === 'web') {
    throw new Error('Card image import is not available in the web build');
  }
  return (await desktopCommands()).importCardImageFile(input);
}

export async function copyCardAssets(input: {
  sourceCdbPath: string;
  targetCdbPath: string;
  cardIds: number[];
  includeImages: boolean;
  includeScripts: boolean;
}) {
  return (await desktopCommands()).copyCardAssets(input);
}

export async function readLuaHelperScripts(path: string) {
  if (host.kind === 'web') return [];
  return (await desktopCommands()).readLuaHelperScripts(path);
}

export async function readBuiltinLuaHelperScripts() {
  if (host.kind === 'web') return [];
  return (await desktopCommands()).readBuiltinLuaHelperScripts();
}

export async function checkAssets(cdbPath: string, cardIds: number[]) {
  return (await desktopCommands()).checkAssets(cdbPath, cardIds);
}

export async function revealFile(path: string) {
  if (host.kind === 'web') return;
  return (await desktopCommands()).revealFile(path);
}
