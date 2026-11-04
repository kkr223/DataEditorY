import type { ExtensionModule } from '#lib/platform/index.ts';
import { aiModule } from './ai';
import { cardModule } from './card';
import { cdbModule } from './cdb';
import { contextMenuModule } from './context-menu';
import { luaModule } from './lua';
import { mergeModule } from './merge';
import { packageModule } from './package';
import { settingsModule } from './settings';
import { workspaceSearchModule } from './workspace-search';

export const builtInModules: ExtensionModule[] = [
  settingsModule,
  cardModule,
  cdbModule,
  luaModule,
  contextMenuModule,
  packageModule,
  mergeModule,
  aiModule,
  workspaceSearchModule,
];

export const builtInModuleIds = builtInModules.map((module) => module.id);
