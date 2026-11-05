export {
  copyCardAssets,
  importCardImageFile,
  listImageFolderEntries,
  loadStringsConfContent,
  pathExists,
  readBuiltinLuaHelperScripts,
  readCdbFile,
  readImageFile,
  readLuaHelperScripts,
  readTextFile,
  resolveResourceFile,
  writeBinaryFile,
  writeTextFile,
} from '#lib/infrastructure/tauri/commands.ts';

export type { LuaHelperScript } from '#lib/infrastructure/tauri/commands.ts';

import { invokeCommand } from '#lib/infrastructure/tauri/index.ts';

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

export function checkAssets(cdbPath: string, cardIds: number[]) {
  return invokeCommand<AssetCheckResponse>('check_assets', {
    request: { cdbPath, cardIds },
  });
}

export function revealFile(path: string) {
  return invokeCommand<void>('reveal_file', { path });
}
