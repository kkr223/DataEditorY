import type { AppFeatureFlags } from '$lib/config/build';
import type { CapabilityDescriptor, CapabilityId } from '$lib/application/capabilities/types';

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
