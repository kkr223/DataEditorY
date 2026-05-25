import { APP_FEATURES, type AppFeatureFlags } from '$lib/config/build';

export type CapabilityId =
  | 'db-editor'
  | 'script-editor'
  | 'settings'
  | 'package'
  | 'merge'
  | 'card-image'
  | 'ai';

export interface CapabilityDescriptor {
  id: CapabilityId;
  enabled: boolean;
  dependencies: CapabilityId[];
  actions: string[];
  uiMounts: string[];
}

export function createCapabilityRegistry(features: AppFeatureFlags): CapabilityDescriptor[] {
  return [
    {
      id: 'db-editor',
      enabled: true,
      dependencies: [],
      actions: ['open-db', 'create-db', 'save-db', 'search-cards', 'modify-cards'],
      uiMounts: ['topbar', 'workspace:db'],
    },
    {
      id: 'script-editor',
      enabled: true,
      dependencies: ['db-editor'],
      actions: ['open-script', 'save-script'],
      uiMounts: ['workspace:script'],
    },
    {
      id: 'settings',
      enabled: true,
      dependencies: [],
      actions: ['open-settings', 'save-settings'],
      uiMounts: ['topbar', 'workspace:settings'],
    },
    {
      id: 'package',
      enabled: true,
      dependencies: ['db-editor'],
      actions: ['package-zip', 'package-ypk', 'create-filtered-cdb'],
      uiMounts: ['topbar', 'shell:create-filtered-cdb'],
    },
    {
      id: 'merge',
      enabled: true,
      dependencies: ['db-editor'],
      actions: ['analyze-merge', 'execute-merge'],
      uiMounts: ['topbar', 'shell:merge'],
    },
    {
      id: 'card-image',
      enabled: features.cardImage,
      dependencies: ['db-editor'],
      actions: ['import-card-image', 'edit-card-image'],
      uiMounts: ['workspace:db:card-image'],
    },
    {
      id: 'ai',
      enabled: features.ai,
      dependencies: ['db-editor', 'settings'],
      actions: ['parse-manuscript', 'generate-script'],
      uiMounts: ['workspace:db:ai', 'workspace:settings:ai'],
    },
  ];
}

export function isCapabilityEnabledInRegistry(
  registry: CapabilityDescriptor[],
  id: CapabilityId,
) {
  return registry.some((capability) => capability.id === id && capability.enabled);
}

export function isAnyCapabilityEnabledInRegistry(
  registry: CapabilityDescriptor[],
  ids: readonly CapabilityId[],
) {
  return ids.some((id) => isCapabilityEnabledInRegistry(registry, id));
}

export const capabilityRegistry = createCapabilityRegistry(APP_FEATURES);

type CapabilityRequirement = CapabilityId | readonly CapabilityId[];

// Dynamic imports need scalar constants so base builds can tree-shake excluded feature chunks.
export const AI_CAPABILITY_ENABLED = APP_FEATURES.ai;
export const CARD_IMAGE_CAPABILITY_ENABLED = APP_FEATURES.cardImage;
export const CARD_EDITOR_EXTRA_CAPABILITY_ENABLED = APP_FEATURES.ai || APP_FEATURES.cardImage;

function capabilityIds(requirement: CapabilityRequirement): readonly CapabilityId[] {
  return Array.isArray(requirement) ? requirement : [requirement];
}

export function isCapabilityEnabled(id: CapabilityId) {
  return isCapabilityEnabledInRegistry(capabilityRegistry, id);
}

export function isAnyCapabilityEnabled(requirement: CapabilityRequirement) {
  return isAnyCapabilityEnabledInRegistry(capabilityRegistry, capabilityIds(requirement));
}

export function getEnabledCapabilities() {
  return capabilityRegistry.filter((capability) => capability.enabled);
}
