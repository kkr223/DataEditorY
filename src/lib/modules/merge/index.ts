import type { ExtensionModule } from '#lib/platform/index.ts';

export const mergeModule: ExtensionModule = {
  id: 'merge',
  dependencies: ['card', 'cdb'],
};
