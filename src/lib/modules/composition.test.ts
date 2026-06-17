import { describe, expect, test } from 'bun:test';
import { ExtensionRegistry } from '$lib/platform';
import { builtInModules as baseModules } from './base';
import { builtInModules as extraModules } from './extra';

describe('built-in module composition', () => {
  test('base contains only core editing modules', () => {
    const registry = new ExtensionRegistry(baseModules);
    expect([...registry.modules.keys()]).toEqual([
      'settings',
      'card',
      'cdb',
      'lua',
      'package',
      'merge',
    ]);
    expect(registry.modules.has('ai')).toBe(false);
    expect(registry.modules.has('card-image')).toBe(false);
  });

  test('extra adds card image and AI modules', () => {
    const registry = new ExtensionRegistry(extraModules);
    expect(registry.modules.has('ai')).toBe(true);
    expect(registry.modules.has('card-image')).toBe(true);
    expect(registry.findCodecForSource('100-card-image.json')?.id)
      .toBe('card-image.json-codec');
  });
});
