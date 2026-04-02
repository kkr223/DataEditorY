import { APP_FEATURES } from '$lib/config/build';
import type { CapabilityId } from '$lib/application/capabilities/types';
import {
  createCapabilityRegistry,
  isCapabilityEnabledInRegistry,
} from '$lib/application/capabilities/definitions';

export const capabilityRegistry = createCapabilityRegistry(APP_FEATURES);

export function isCapabilityEnabled(id: CapabilityId) {
  return isCapabilityEnabledInRegistry(capabilityRegistry, id);
}

export function getEnabledCapabilities() {
  return capabilityRegistry.filter((capability) => capability.enabled);
}
