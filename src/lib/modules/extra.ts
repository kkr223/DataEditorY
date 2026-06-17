import type { ExtensionModule } from '$lib/platform';
import { aiModule } from './ai';
import { builtInModules as baseModules } from './base';
import { cardImageModule } from './card-image';

export const builtInModules: ExtensionModule[] = [
  ...baseModules,
  cardImageModule,
  aiModule,
];

export const builtInModuleIds = builtInModules.map((module) => module.id);
