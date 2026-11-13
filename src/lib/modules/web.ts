import type { ExtensionModule } from '#lib/platform/index.ts';
import type { DocumentHostTransport } from '#lib/platform/transport/types.ts';
import { cardModule } from './card';
import { createCdbModule } from './cdb';
import { contextMenuModule } from './context-menu';
import { mergeModule } from './merge';
import { packageModule } from './package';
import { settingsModule } from './settings';

/** Web variant: CDB editing plus the tools that work without scripts or images. */
export const createBuiltInModules = (transport: DocumentHostTransport): ExtensionModule[] => [
  settingsModule,
  cardModule,
  createCdbModule(transport),
  contextMenuModule,
  packageModule,
  mergeModule,
];
