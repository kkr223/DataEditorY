import { tauriBridge } from '$lib/infrastructure/tauri';
import { importCardImageFile } from '$lib/infrastructure/tauri/commands';
import { toMediaProtocolSrc } from '$lib/utils/mediaProtocol';

export async function getPicsDir(cdbPath: string) {
  const cdbDir = await tauriBridge.dirname(cdbPath);
  return tauriBridge.join(cdbDir, 'pics');
}

export async function resolveCardImageSrc(cdbPath: string, code: number, bustCache = false) {
  const picsDir = await getPicsDir(cdbPath);
  const picPath = await tauriBridge.join(picsDir, `${code}.jpg`);
  return toMediaProtocolSrc(picPath, bustCache ? Date.now() : undefined);
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
