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

export type MergeSourceItem = {
  path: string;
  name: string;
  projectDir: string;
  cardTotal?: number;
};

export type MergeSourcePlanItem = {
  path: string;
  name: string;
  cardTotal: number;
  winningCardCount: number;
  winningMainImageCount: number;
  winningFieldImageCount: number;
  winningScriptCount: number;
};

export type AnalyzeCdbMergeResponse = {
  sourceCount: number;
  mergedTotal: number;
  duplicateCardTotal: number;
  mainImageTotal: number;
  fieldImageTotal: number;
  scriptTotal: number;
  sources: MergeSourcePlanItem[];
};

export type ExecuteCdbMergeResponse = {
  outputPath: string;
};

export type BackgroundTaskProgressEvent = {
  task: 'package' | 'merge';
  stage: string;
  current: number;
  total: number;
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

export async function openInDefaultApp(path: string) {
  return invokeCommand('open_in_default_app', { path });
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

export async function writeTextFile(path: string, content: string) {
  const encoder = new TextEncoder();
  return invokeCommand('write_file', { path, data: Array.from(encoder.encode(content)) });
}

export async function readTextFile(path: string) {
  return invokeCommand<string>('read_text_file', { path });
}

export async function pathExists(path: string) {
  return invokeCommand<boolean>('path_exists', { path });
}

export async function listImageFolderEntries(path: string) {
  return invokeCommand<string[]>('list_image_folder_entries', { path });
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

export async function collectMergeSourcesFromFolder(directoryPath: string) {
  return invokeCommand<MergeSourceItem[]>('collect_merge_sources_from_folder', {
    request: { directoryPath },
  });
}

export async function analyzeCdbMerge(sourcePaths: string[], includeImages: boolean, includeScripts: boolean) {
  return invokeCommand<AnalyzeCdbMergeResponse>('analyze_cdb_merge', {
    request: { sourcePaths, includeImages, includeScripts },
  });
}

export async function executeCdbMerge(input: {
  sourcePaths: string[];
  outputDir: string;
  includeImages: boolean;
  includeScripts: boolean;
}) {
  return invokeCommand<ExecuteCdbMergeResponse>('execute_cdb_merge', { request: input });
}

export async function consumePendingOpenCdbPaths() {
  return invokeCommand<string[]>('consume_pending_open_cdb_paths');
}

export async function loadStringsConfContent() {
  return invokeCommand<string>('load_strings_conf');
}
