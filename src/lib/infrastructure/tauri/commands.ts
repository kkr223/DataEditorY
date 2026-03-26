import { invokeCommand } from '$lib/infrastructure/tauri';

export type CardScriptInfo = {
  path: string;
  exists: boolean;
};

export type CardScriptDocument = CardScriptInfo & {
  content: string;
};

export type ZipPackageInfo = {
  path: string;
};

export type MergeConflictItem = {
  code: number;
  aCard: import('$lib/types').CardDataEntry;
  bCard: import('$lib/types').CardDataEntry;
  hasCardConflict: boolean;
  hasImageConflict: boolean;
  hasFieldImageConflict: boolean;
  hasScriptConflict: boolean;
};

export type AnalyzeCdbMergeResponse = {
  aName: string;
  bName: string;
  aTotal: number;
  bTotal: number;
  mergedTotal: number;
  conflicts: MergeConflictItem[];
};

export async function getCardScriptInfo(cdbPath: string, cardId: number) {
  return invokeCommand<CardScriptInfo>('get_card_script_info', { cdbPath, cardId });
}

export async function readCardScriptDocument(cdbPath: string, cardId: number) {
  return invokeCommand<CardScriptDocument>('read_card_script', { cdbPath, cardId });
}

export async function writeCardScriptDocument(cdbPath: string, cardId: number, content: string, overwrite = true) {
  return invokeCommand<CardScriptInfo>('write_card_script', {
    cdbPath,
    cardId,
    content,
    overwrite,
  });
}

export async function saveCardScriptDocument(cdbPath: string, cardId: number, content: string) {
  return invokeCommand<CardScriptInfo>('save_card_script', { cdbPath, cardId, content });
}

export async function openInSystemEditor(path: string) {
  return invokeCommand('open_in_system_editor', { path });
}

export async function importCardImageFile(input: {
  src: string;
  dest: string;
  maxWidth: number;
  maxHeight: number;
  quality: number;
}) {
  return invokeCommand('import_card_image', input);
}

export async function writeBinaryFile(path: string, data: number[]) {
  return invokeCommand('write_file', { path, data });
}

export async function pathExists(path: string) {
  return invokeCommand<boolean>('path_exists', { path });
}

export async function packageCdbAssetsAsZip(cdbPath: string, outputPath: string) {
  return invokeCommand<ZipPackageInfo>('package_cdb_assets_as_zip', { cdbPath, outputPath });
}

export async function createCdbFromCards(outputPath: string, cards: import('$lib/types').CardDataEntry[]) {
  return invokeCommand('create_cdb_from_cards', {
    request: { outputPath, cards },
  });
}

export async function copyCardAssets(input: {
  sourceCdbPath: string;
  targetCdbPath: string;
  cardIds: number[];
  includeImages: boolean;
  includeScripts: boolean;
}) {
  return invokeCommand('copy_card_assets', { request: input });
}

export async function analyzeCdbMerge(aPath: string, bPath: string) {
  return invokeCommand<AnalyzeCdbMergeResponse>('analyze_cdb_merge', {
    request: { aPath, bPath },
  });
}

export async function executeCdbMerge(input: {
  aPath: string;
  bPath: string;
  outputPath: string;
  conflictMode: 'preferA' | 'preferB' | 'manual';
  manualChoices: Record<number, 'a' | 'b'>;
  includeImages: boolean;
  includeScripts: boolean;
}) {
  return invokeCommand('execute_cdb_merge', { request: input });
}

export async function consumePendingOpenCdbPaths() {
  return invokeCommand<string[]>('consume_pending_open_cdb_paths');
}

export async function loadStringsConfContent() {
  return invokeCommand<string>('load_strings_conf');
}
