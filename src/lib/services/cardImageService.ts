import { tauriBridge } from '#lib/infrastructure/tauri/index.ts';
import { importCardImageFile, readImageFile } from '#lib/native/assetApi.ts';
import { toMediaProtocolSrc } from '#lib/utils/mediaProtocol.ts';

const BASE64_CHUNK_SIZE = 0x8000;

export function cardImageBytesToDataUrl(bytes: ArrayLike<number>) {
  const values = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
  let binary = '';
  for (let offset = 0; offset < values.length; offset += BASE64_CHUNK_SIZE) {
    binary += String.fromCharCode(...values.subarray(offset, offset + BASE64_CHUNK_SIZE));
  }
  return `data:image/jpeg;base64,${btoa(binary)}`;
}

export async function getPicsDir(cdbPath: string) {
  const cdbDir = await tauriBridge.dirname(cdbPath);
  return tauriBridge.join(cdbDir, 'pics');
}

/** Builds a pics path without an IPC round trip per card. */
export function cardImagePathFromPicsDir(picsDir: string, code: number) {
  const separator = picsDir.includes('\\') ? '\\' : '/';
  return `${picsDir.replace(/[\\/]+$/, '')}${separator}${code}.jpg`;
}

export async function resolveCardImageSrcFromPicsDir(
  picsDir: string,
  code: number,
  bustCache = false,
) {
  const picPath = cardImagePathFromPicsDir(picsDir, code);

  if (bustCache && tauriBridge.isTauri()) {
    try {
      return cardImageBytesToDataUrl(await readImageFile(picPath));
    } catch {
      // Keep the normal image error/fallback behavior when the card has no image.
    }
  }

  return toMediaProtocolSrc(picPath, bustCache ? Date.now() : undefined);
}

export async function resolveCardImageSrc(cdbPath: string, code: number, bustCache = false) {
  return resolveCardImageSrcFromPicsDir(await getPicsDir(cdbPath), code, bustCache);
}

export async function importCardImage(input: {
  cdbPath: string;
  cardCode: number;
  sourcePath: string;
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
}) {
  const picsDir = await getPicsDir(input.cdbPath);
  const picPath = await tauriBridge.join(picsDir, `${input.cardCode}.jpg`);
  await importCardImageFile({
    src: input.sourcePath,
    dest: picPath,
    maxWidth: input.maxWidth ?? 400,
    maxHeight: input.maxHeight ?? 580,
    quality: input.quality ?? 92,
  });
  return picPath;
}
