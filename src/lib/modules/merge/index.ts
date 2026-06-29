import type { ExtensionModule } from '$lib/platform';

export const mergeModule: ExtensionModule = {
  id: 'merge',
  dependencies: ['card', 'cdb'],
};
