export {
  getCardScriptInfo,
  openInDefaultApp,
  openInSystemEditor,
  readCardScriptDocument,
  saveCardScriptDocument,
  writeCardScriptDocument,
} from '$lib/infrastructure/tauri/commands';

export {
  openCardScriptWorkspace,
} from '$lib/services/cardScriptService';

import { invokeCommand } from '$lib/infrastructure/tauri';

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

export function previewLuaReplace(request: LuaReplaceRequest) {
  return invokeCommand<LuaReplacePreview>('preview_lua_replace', { request });
}

export function applyLuaReplace(request: LuaReplaceRequest) {
  return invokeCommand<LuaReplacePreview>('apply_lua_replace', { request });
}
