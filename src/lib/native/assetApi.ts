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
} from '$lib/infrastructure/tauri/commands';

export type { LuaHelperScript } from '$lib/infrastructure/tauri/commands';

import { invokeCommand } from '$lib/infrastructure/tauri';

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
