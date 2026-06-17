import type { ExtensionModule } from '$lib/platform';
import { cardModule } from './card';
import { cdbModule } from './cdb';
import { luaModule } from './lua';
import { mergeModule } from './merge';
import { packageModule } from './package';
import { settingsModule } from './settings';

export const builtInModules: ExtensionModule[] = [
  settingsModule,
  cardModule,
  cdbModule,
  luaModule,
  packageModule,
  mergeModule,
];

export const builtInModuleIds = builtInModules.map((module) => module.id);
