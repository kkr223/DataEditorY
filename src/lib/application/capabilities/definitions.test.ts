import { describe, expect, test } from 'bun:test';
import {
  createCapabilityRegistry,
  isCapabilityEnabledInRegistry,
} from '$lib/application/capabilities/definitions';

describe('capability registry definitions', () => {
  test('always exposes the core shell capabilities', () => {
    const registry = createCapabilityRegistry({ ai: false, cardImage: false });

    expect(isCapabilityEnabledInRegistry(registry, 'db-editor')).toBe(true);
    expect(isCapabilityEnabledInRegistry(registry, 'script-editor')).toBe(true);
    expect(isCapabilityEnabledInRegistry(registry, 'settings')).toBe(true);
    expect(isCapabilityEnabledInRegistry(registry, 'package')).toBe(true);
    expect(isCapabilityEnabledInRegistry(registry, 'merge')).toBe(true);
  });

  test('keeps dependency metadata for optional capabilities', () => {
    const registry = createCapabilityRegistry({ ai: true, cardImage: true });
    const aiCapability = registry.find((capability) => capability.id === 'ai');
    const cardImageCapability = registry.find((capability) => capability.id === 'card-image');

    expect(aiCapability?.dependencies).toEqual(['db-editor', 'settings']);
    expect(cardImageCapability?.dependencies).toEqual(['db-editor']);
  });

  test('reflects build composition for optional capabilities', () => {
    const baseRegistry = createCapabilityRegistry({ ai: false, cardImage: false });
    const extraRegistry = createCapabilityRegistry({ ai: true, cardImage: true });

    expect(isCapabilityEnabledInRegistry(baseRegistry, 'ai')).toBe(false);
    expect(isCapabilityEnabledInRegistry(baseRegistry, 'card-image')).toBe(false);
    expect(isCapabilityEnabledInRegistry(extraRegistry, 'ai')).toBe(true);
    expect(isCapabilityEnabledInRegistry(extraRegistry, 'card-image')).toBe(true);
  });
});
