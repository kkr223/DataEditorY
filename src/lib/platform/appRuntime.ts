import { createBuiltInModules } from '#lib/modules/active.ts';
import { host } from '#lib/platform/host/index.ts';
import { documentHostTransport } from '#lib/platform/transport/active.ts';
import { DocumentRuntime } from './runtime';

const codecContext = {
  readText: (path: string) => host.fs.readText(path),
  writeText: (path: string, content: string) => host.fs.writeText(path, content),
  readBinary: (path: string) => host.fs.readBinary(path),
  writeBinary: (path: string, content: Uint8Array) => host.fs.writeBinary(path, content),
};

export const documentRuntime = new DocumentRuntime(
  createBuiltInModules(documentHostTransport),
  codecContext,
);
