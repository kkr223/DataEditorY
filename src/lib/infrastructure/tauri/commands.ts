import { invokeCommand } from '#lib/infrastructure/tauri/index.ts';

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

export type LuaHelperScript = {
  name: string;
  path: string;
  content: string;
};

export async function getCardScriptInfo(cdbPath: string, cardId: number) {
  return invokeCommand<CardScriptInfo>('get_card_script_info', { cdbPath, cardId });
}

export async function readCardScriptDocument(cdbPath: string, cardId: number) {
  return invokeCommand<CardScriptDocument>('read_card_script', { cdbPath, cardId });
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

export async function writeBinaryFile(path: string, data: Uint8Array) {
  return invokeCommand('write_binary_file', frameBinaryRequest(path, data));
}

/** Frames `[u32 path byte length][path utf-8][data]` for raw IPC commands. */
function frameBinaryRequest(path: string, data: Uint8Array) {
  const pathBytes = new TextEncoder().encode(path);
  const payload = new Uint8Array(4 + pathBytes.length + data.length);
  new DataView(payload.buffer).setUint32(0, pathBytes.length, true);
  payload.set(pathBytes, 4);
  payload.set(data, 4 + pathBytes.length);
  return payload;
}

export async function readBinaryFile(path: string) {
  const buffer = await invokeCommand<ArrayBuffer>('read_binary_file', { path });
  return new Uint8Array(buffer);
}

export function readCdbFile(path: string) {
  return readBinaryFile(path);
}

export function readImageFile(path: string) {
  return readBinaryFile(path);
}

export async function writeTextFile(path: string, content: string) {
  const encoder = new TextEncoder();
  return writeBinaryFile(path, encoder.encode(content));
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

export async function readLuaHelperScripts(path: string) {
  return invokeCommand<LuaHelperScript[]>('read_lua_helper_scripts', { path });
}

export async function readBuiltinLuaHelperScripts() {
  return invokeCommand<LuaHelperScript[]>('read_builtin_lua_helper_scripts');
}

export type AssetCheckResponse = {
  checked: number;
  missingImages: number;
  missingScripts: number;
  missing: Array<{ cardId: number; imageMissing: boolean; scriptMissing: boolean }>;
};

export function checkAssets(cdbPath: string, cardIds: number[]) {
  return invokeCommand<AssetCheckResponse>('check_assets', {
    request: { cdbPath, cardIds },
  });
}

export async function packageCdbAssetsAsZip(cdbPath: string, outputPath: string) {
  return invokeCommand<ZipPackageInfo>('package_cdb_assets_as_zip', { cdbPath, outputPath });
}

export async function createCdbFromCards(outputPath: string, cards: import('#lib/types/index.ts').CardDataEntry[]) {
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
  outputDir?: string;
  outputPath?: string;
  includeImages: boolean;
  includeScripts: boolean;
}) {
  return invokeCommand<ExecuteCdbMergeResponse>('execute_cdb_merge', { request: input });
}

export function revealFile(path: string) {
  return invokeCommand<void>('reveal_file', { path });
}

export async function consumePendingOpenCdbPaths() {
  return invokeCommand<string[]>('consume_pending_open_cdb_paths');
}

export async function loadStringsConfContent() {
  return invokeCommand<string>('load_strings_conf');
}

export async function resolveResourceFile(relativePath: string) {
  return invokeCommand<string>('resolve_resource_file', { relativePath });
}
