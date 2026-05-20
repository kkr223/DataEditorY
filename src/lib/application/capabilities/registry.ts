import { APP_FEATURES } from '$lib/config/build';
import type { CapabilityId } from '$lib/application/capabilities/types';
import {
  createCapabilityRegistry,
  isAnyCapabilityEnabledInRegistry,
  isCapabilityEnabledInRegistry,
} from '$lib/application/capabilities/definitions';

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
