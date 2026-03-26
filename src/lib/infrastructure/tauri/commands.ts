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

export async function consumePendingOpenCdbPaths() {
  return invokeCommand<string[]>('consume_pending_open_cdb_paths');
}

export async function loadStringsConfContent() {
  return invokeCommand<string>('load_strings_conf');
}
