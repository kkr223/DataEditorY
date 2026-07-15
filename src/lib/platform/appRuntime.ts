import {
  readImageFile,
  readTextFile,
  writeBinaryFile,
  writeTextFile,
} from '$lib/native/assetApi';
import { builtInModules } from '$lib/modules/active';
import { DocumentRuntime } from './runtime';

const codecContext = {
  readText: readTextFile,
  async writeText(path: string, content: string) {
    await writeTextFile(path, content);
  },
  async readBinary(path: string) {
    const bytes = await readImageFile(path);
    return new Uint8Array(bytes);
  },
  async writeBinary(path: string, content: Uint8Array) {
    await writeBinaryFile(path, Array.from(content));
  },
};

export const documentRuntime = new DocumentRuntime(builtInModules, codecContext);
