import { invokeCommand } from '$lib/infrastructure/tauri';
import {
  readTextFile,
  writeBinaryFile,
  writeTextFile,
} from '$lib/infrastructure/tauri/commands';
import { builtInModules } from '$lib/modules/active';
import { DocumentRuntime } from './runtime';

const codecContext = {
  readText: readTextFile,
  async writeText(path: string, content: string) {
    await writeTextFile(path, content);
  },
  async readBinary(path: string) {
    const bytes = await invokeCommand<number[]>('read_image', { path });
    return new Uint8Array(bytes);
  },
  async writeBinary(path: string, content: Uint8Array) {
    await writeBinaryFile(path, Array.from(content));
  },
};

export const documentRuntime = new DocumentRuntime(builtInModules, codecContext);
