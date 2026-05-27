import { invokeCommand } from '$lib/infrastructure/tauri';
import type {
  AnalyzeCdbMergeResponse,
  BackgroundTaskProgressEvent,
  CardDataEntry,
  CardScriptDocument,
  CardScriptInfo,
  CopyCardAssetsRequest,
  CreateCdbFromCardsRequest,
  ExecuteCdbMergeRequest,
  ExecuteCdbMergeResponse,
  ExternalOpenPaths,
  MergeSourceItem,
  PreparedCardRenderResource,
  RenderCardPayload,
  ZipPackageInfo,
} from '$lib/types';

export type {
  AnalyzeCdbMergeResponse,
  BackgroundTaskProgressEvent,
  CardScriptDocument,
  CardScriptInfo,
  ExecuteCdbMergeResponse,
  ExternalOpenPaths,
  MergeSourceItem,
  PreparedCardRenderResource,
  RenderCardPayload,
  ZipPackageInfo,
} from '$lib/types';

export type ListAiModelsRequest = {
  apiBaseUrl: string;
  secretKey?: string;
};

export type AiChatCompletionRequest = {
  apiBaseUrl: string;
  body: Record<string, unknown>;
};

export type SelectedTextFileContent = {
  path: string;
  content: string;
};

export async function listAiModels(request: ListAiModelsRequest) {
  return invokeCommand<string[]>('list_ai_models', { request });
}

export async function requestAiChatCompletion(request: AiChatCompletionRequest) {
  return invokeCommand<unknown>('request_ai_chat_completion', { request });
}

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

export async function readExternalTextFile(path: string) {
  return invokeCommand<string>('read_external_text_file', { path });
}

export async function saveExternalTextFile(path: string, content: string) {
  return invokeCommand('save_external_text_file', { path, content });
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

export async function pickCardImageConfig() {
  return invokeCommand<SelectedTextFileContent | null>('pick_card_image_config');
}

export async function pickDeckText() {
  return invokeCommand<SelectedTextFileContent | null>('pick_deck_text');
}

export async function saveCardImageConfig(defaultFileName: string, content: string) {
  return invokeCommand<string | null>('save_card_image_config', {
    defaultFileName,
    content,
  });
}

export async function savePngFile(defaultFileName: string, data: number[]) {
  return invokeCommand<string | null>('save_png_file', {
    defaultFileName,
    data,
  });
}

export async function saveCardImageJpg(input: {
  cdbPath: string;
  cardCode: number;
  imageData: number[];
  fieldImageData?: number[] | null;
}) {
  return invokeCommand('save_card_image_jpg', input);
}

export async function saveScriptImage(cdbPath: string, cardCode: number, data: number[]) {
  return invokeCommand<string>('save_script_image', { cdbPath, cardCode, data });
}

export async function loadLuaIntelResource(filename: string) {
  return invokeCommand<string>('load_lua_intel_resource', { filename });
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

export async function createCdbFromCards(outputPath: string, cards: CardDataEntry[]) {
  const request: CreateCdbFromCardsRequest = {
    outputPath,
    cards,
  };
  return invokeCommand('create_cdb_from_cards', {
    request,
  });
}

export async function copyCardAssets(input: CopyCardAssetsRequest) {
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

export async function executeCdbMerge(input: ExecuteCdbMergeRequest) {
  return invokeCommand<ExecuteCdbMergeResponse>('execute_cdb_merge', { request: input });
}

export async function consumePendingOpenCdbPaths() {
  return invokeCommand<string[]>('consume_pending_open_cdb_paths');
}

export async function consumePendingExternalOpenPaths() {
  return invokeCommand<ExternalOpenPaths>('consume_pending_external_open_paths');
}

export async function loadStringsConfContent() {
  return invokeCommand<string>('load_strings_conf');
}

export async function renderCardImage(payload: RenderCardPayload) {
  return invokeCommand<number[]>('render_card', { payload });
}

export async function prepareCardRenderResource(dataUrl: string) {
  return invokeCommand<PreparedCardRenderResource>('prepare_card_render_resource', {
    request: { dataUrl },
  });
}

export async function releaseCardRenderResource(token: string) {
  return invokeCommand('release_card_render_resource', { token });
}
