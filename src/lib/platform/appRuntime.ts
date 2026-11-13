import {
  readImageFile,
  readTextFile,
  writeBinaryFile,
  writeTextFile,
} from '#lib/native/assetApi.ts';
import { createBuiltInModules } from '#lib/modules/active.ts';
import { tauriDocumentHostTransport } from '#lib/platform/transport/tauri.ts';
import { DocumentRuntime } from './runtime';

const codecContext = {
  readText: readTextFile,
  async writeText(path: string, content: string) {
    await writeTextFile(path, content);
  },
  async readBinary(path: string) {
    return readImageFile(path);
  },
  async writeBinary(path: string, content: Uint8Array) {
    await writeBinaryFile(path, content);
  },
};

export const documentRuntime = new DocumentRuntime(
  createBuiltInModules(tauriDocumentHostTransport),
  codecContext,
);
