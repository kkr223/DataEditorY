import { MemoryDocumentProvider, type ExtensionModule } from '#lib/platform/index.ts';
import { LUA_SCRIPT_TYPE, validateLuaScriptDocument } from './types';

export const LUA_MEMORY_PROVIDER_ID = 'lua.memory-provider';
export const LUA_FILE_CODEC_ID = 'lua.file-codec';

export const luaModule: ExtensionModule = {
  id: 'lua',
  dependencies: ['card'],
  dataTypes: [{
    typeId: LUA_SCRIPT_TYPE,
    version: 1,
    validate: validateLuaScriptDocument,
  }],
  providers: [{
    id: LUA_MEMORY_PROVIDER_ID,
    typeIds: [LUA_SCRIPT_TYPE],
    create: () => new MemoryDocumentProvider(),
  }],
  codecs: [{
    id: LUA_FILE_CODEC_ID,
    typeId: LUA_SCRIPT_TYPE,
    filePatterns: ['.lua'],
    canCreate: true,
    async decode(source, context) {
      const content = await context.readText(source.path ?? source.uri);
      return {
        typeId: LUA_SCRIPT_TYPE,
        schemaVersion: 1,
        title: source.name,
        providerId: LUA_MEMORY_PROVIDER_ID,
        providerInput: { content, language: 'lua' },
      };
    },
    async encode(document, destination, context) {
      const snapshot = validateLuaScriptDocument(await document.snapshot());
      await context.writeText(destination.path ?? destination.uri, snapshot.content);
    },
  }],
  globalTools: [{
    id: 'lua.replace',
    labelKey: 'nav.tools_lua_replace',
    requiresActiveCdb: true,
    component: () => import('#lib/features/shell/components/dialogs/LuaReplaceDialog.svelte'),
  }],
  workbenches: [{
    id: 'lua.workbench',
    acceptedTypeIds: [LUA_SCRIPT_TYPE],
    component: () => import('./workbench/LuaWorkbench.svelte'),
  }],
  workbenchContributions: [{
    id: 'lua.card-actions',
    workbenchId: 'card.workbench',
    slot: 'footer-actions',
    order: 10,
    component: () => import('./workbench/CardScriptContribution.svelte'),
  }, {
    id: 'lua.card-surface',
    workbenchId: 'card.workbench',
    slot: 'surface',
    order: 20,
    metadata: {
      surfaceId: 'script',
      labelKey: 'surface.script',
      icon: '{}',
      openOnActivate: true,
      requiresWorkspaceMetadata: true,
      activate: () => {
        void import('./workbench/surfaceActivation.ts')
          .then((module) => module.activateLuaCardSurface());
      },
    },
    component: () => import('#lib/modules/card/workbench/ScriptSurface.svelte'),
  }],
};

export * from './types';
