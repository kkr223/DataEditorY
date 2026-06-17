import { MemoryDocumentProvider, type ExtensionModule } from '$lib/platform';

export const SETTINGS_TYPE = 'dataeditory.settings';
export const SETTINGS_PROVIDER_ID = 'settings.memory-provider';

export const settingsModule: ExtensionModule = {
  id: 'settings',
  dataTypes: [{
    typeId: SETTINGS_TYPE,
    version: 1,
    validate(value) {
      if (!value || typeof value !== 'object') {
        throw new Error('Settings must be an object');
      }
      return value;
    },
  }],
  providers: [{
    id: SETTINGS_PROVIDER_ID,
    typeIds: [SETTINGS_TYPE],
    savePolicy: 'automatic',
    create: () => new MemoryDocumentProvider(),
  }],
  workbenches: [{
    id: 'settings.workbench',
    acceptedTypeIds: [SETTINGS_TYPE],
    component: () => import('./workbench/SettingsWorkbench.svelte'),
  }],
};
