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

function createDetachedModel(source: string): LuaSemanticTextModel {
  const sourceLines = source.split('\n');
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
  }

  return {
    uri: {
      toString() {
        return `inmemory://dataeditory/lua-diagnostics-${hash}.lua`;
      },
    },
    getValue() {
      return source;
    },
    getVersionId() {
      return hash;
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

