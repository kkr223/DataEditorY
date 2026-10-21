import type { ExtensionModule } from '$lib/platform';

// The shell hosts the shared popup; card and Lua surfaces supply scoped actions.
export const contextMenuModule: ExtensionModule = {
  id: 'context-menu',
  dependencies: ['card', 'cdb', 'lua'],
};
