import type {
  CardScriptDocument,
  CardScriptInfo,
} from '#lib/infrastructure/tauri/commands.ts';

export type {
  CardScriptDocument,
  CardScriptInfo,
} from '#lib/infrastructure/tauri/commands.ts';

export type LuaReplaceRequest = {
  cdbPath: string;
  find: string;
  replace: string;
  regex: boolean;
  caseSensitive: boolean;
  include?: string;
  exclude?: string;
};

export type LuaReplaceFilePreview = {
  path: string;
  matchCount: number;
  snippets: string[];
  diffs?: Array<{
    before: string;
    after: string;
  }>;
};

export type LuaReplacePreview = {
  fileCount: number;
  matchCount: number;
  files: LuaReplaceFilePreview[];
};

function desktopCommands() {
  return import('#lib/infrastructure/tauri/commands.ts');
}

export async function getCardScriptInfo(cdbPath: string, cardId: number): Promise<CardScriptInfo> {
  return (await desktopCommands()).getCardScriptInfo(cdbPath, cardId);
}

export async function readCardScriptDocument(cdbPath: string, cardId: number): Promise<CardScriptDocument> {
  return (await desktopCommands()).readCardScriptDocument(cdbPath, cardId);
}

export async function saveCardScriptDocument(cdbPath: string, cardId: number, content: string): Promise<CardScriptInfo> {
  return (await desktopCommands()).saveCardScriptDocument(cdbPath, cardId, content);
}

export async function openInSystemEditor(path: string) {
  return (await desktopCommands()).openInSystemEditor(path);
}

export async function openInDefaultApp(path: string) {
  return (await desktopCommands()).openInDefaultApp(path);
}

export async function previewLuaReplace(request: LuaReplaceRequest): Promise<LuaReplacePreview> {
  const { invokeCommand } = await import('#lib/infrastructure/tauri/index.ts');
  return invokeCommand<LuaReplacePreview>('preview_lua_replace', { request });
}

export async function applyLuaReplace(request: LuaReplaceRequest): Promise<LuaReplacePreview> {
  const { invokeCommand } = await import('#lib/infrastructure/tauri/index.ts');
  return invokeCommand<LuaReplacePreview>('apply_lua_replace', { request });
}
