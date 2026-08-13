import { luaCatalog as defaultLuaCatalog } from '$lib/data/lua-intel/catalog.generated';
import { loadExternalLuaCatalog } from './catalog';
import {
  getDiagnostics,
  getLuaSemanticDocument,
  type LuaScriptDiagnostic,
  type LuaSemanticTextModel,
} from './semantic';
import type { LuaCatalog } from '$lib/types';

let luaCatalog: LuaCatalog = defaultLuaCatalog;
let catalogLoadPromise: Promise<void> | null = null;
let detachedSource = '';
let detachedVersion = 0;

function createDetachedModel(source: string): LuaSemanticTextModel {
  const sourceLines = source.split('\n');
  if (source !== detachedSource) {
    detachedSource = source;
    detachedVersion += 1;
  }
  const versionId = detachedVersion;

  return {
    uri: {
      toString() {
        return 'inmemory://dataeditory/lua-diagnostics.lua';
      },
    },
    getValue() {
      return source;
    },
    getVersionId() {
      return versionId;
    },
    getLineContent(lineNumber: number) {
      return sourceLines[lineNumber - 1] ?? '';
    },
  };
}

export async function ensureLuaDiagnosticsCatalogLoaded() {
  if (!catalogLoadPromise) {
    catalogLoadPromise = (async () => {
      const externalCatalog = await loadExternalLuaCatalog();
      if (externalCatalog) {
        luaCatalog = externalCatalog;
      }
    })();
  }

  await catalogLoadPromise;
}

export type { LuaScriptDiagnostic };

export function analyzeLuaScript(source: string): LuaScriptDiagnostic[] {
  const model = createDetachedModel(source);
  const document = getLuaSemanticDocument(model, luaCatalog);
  return getDiagnostics(document);
}

