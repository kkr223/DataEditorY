import type { ExtensionModule } from '#lib/platform/index.ts';
import type { DocumentHostTransport } from '#lib/platform/transport/types.ts';
import { createBuiltInModules as createBaseModules } from './base';
import { cardImageModule } from './card-image';

export const createBuiltInModules = (transport: DocumentHostTransport): ExtensionModule[] => [
  ...createBaseModules(transport),
  cardImageModule,
];

