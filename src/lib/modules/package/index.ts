import type { ExtensionModule } from '#lib/platform/index.ts';

export const packageModule: ExtensionModule = {
  id: 'package',
  dependencies: ['card', 'cdb'],
};
