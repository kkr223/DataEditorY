import type { ExtensionModule } from '#lib/platform/index.ts';
import type { DocumentHostTransport } from '#lib/platform/transport/types.ts';
import { aiModule } from './ai';
import { cardModule } from './card';
import { createCdbModule } from './cdb';
import { contextMenuModule } from './context-menu';
import { luaModule } from './lua';
import { mergeModule } from './merge';
import { packageModule } from './package';
import { settingsModule } from './settings';
import { workspaceSearchModule } from './workspace-search';

export const createBuiltInModules = (transport: DocumentHostTransport): ExtensionModule[] => [
  settingsModule,
  cardModule,
  createCdbModule(transport),
  luaModule,
  contextMenuModule,
  packageModule,
  mergeModule,
  aiModule,
  workspaceSearchModule,
];

