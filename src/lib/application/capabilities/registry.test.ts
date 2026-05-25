import { describe, expect, test } from 'bun:test';

Object.assign(globalThis, {
  __APP_BUILD_VARIANT__: 'extra',
  __APP_BUILD_LABEL__: 'Extra',
  __APP_FEATURES__: { ai: true, cardImage: true },
});

const {
  createCapabilityRegistry,
  isAnyCapabilityEnabledInRegistry,
  isCapabilityEnabledInRegistry,
} = await import('$lib/application/capabilities/registry');

describe('capability registry', () => {
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

  test('can evaluate capability groups for optional module loading', () => {
    const baseRegistry = createCapabilityRegistry({ ai: false, cardImage: false });
    const mixedRegistry = createCapabilityRegistry({ ai: false, cardImage: true });

    expect(isAnyCapabilityEnabledInRegistry(baseRegistry, ['ai', 'card-image'])).toBe(false);
    expect(isAnyCapabilityEnabledInRegistry(mixedRegistry, ['ai', 'card-image'])).toBe(true);
  });
});
