export {
  copyCardAssets,
  importCardImageFile,
  listImageFolderEntries,
  loadStringsConfContent,
  pathExists,
  readTextFile,
  writeBinaryFile,
  writeTextFile,
} from '$lib/infrastructure/tauri/commands';

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
