import {
  PersistentMemoryProvider,
  type ExtensionModule,
} from '$lib/platform';
import { AI_SESSION_TYPE, validateAiSession } from './types';

export const AI_SESSION_PROVIDER_ID = 'ai.session-provider';

const getStorage = () => {
  if (typeof localStorage !== 'undefined') {
    return localStorage;
  }
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
};

export const aiModule: ExtensionModule = {
  id: 'ai',
  dependencies: ['card', 'lua', 'settings'],
  dataTypes: [{
    typeId: AI_SESSION_TYPE,
    version: 1,
    validate: validateAiSession,
  }],
  providers: [{
    id: AI_SESSION_PROVIDER_ID,
    typeIds: [AI_SESSION_TYPE],
    savePolicy: 'automatic',
    create: () => new PersistentMemoryProvider('dataeditory:ai-session', getStorage()),
  }],
  workbenches: [{
    id: 'ai.workbench',
    acceptedTypeIds: [AI_SESSION_TYPE],
    component: () => import('./workbench/AiWorkbench.svelte'),
  }],
  settingsSections: [{
    id: 'ai.settings',
    order: 100,
    component: () => import('./workbench/AiSettingsSection.svelte'),
  }],
  workbenchContributions: [{
    id: 'ai.card-surface',
    workbenchId: 'card.workbench',
    slot: 'surface',
    order: 40,
    metadata: {
      surfaceId: 'ai',
      labelKey: 'surface.ai',
      icon: 'AI',
    },
    component: () => import('../card/workbench/AiSurface.svelte'),
  }],
};

export * from './types';
