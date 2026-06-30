import type { ExtensionModule } from '$lib/platform';

export const packageModule: ExtensionModule = {
  id: 'package',
  dependencies: ['card', 'cdb'],
};
