import { describe, expect, test } from 'bun:test';
import { ExtensionRegistry } from '#lib/platform/index.ts';
import type { DocumentHostTransport } from '#lib/platform/transport/types.ts';
import { createBuiltInModules as createBaseModules } from './base';
import { createBuiltInModules as createExtraModules } from './extra';

const unusedTransport: DocumentHostTransport = {
  open: async () => { throw new Error('not used'); },
  query: async () => { throw new Error('not used'); },
  execute: async () => { throw new Error('not used'); },
  save: async () => { throw new Error('not used'); },
  undo: async () => { throw new Error('not used'); },
  close: async () => { throw new Error('not used'); },
};

describe('built-in module composition', () => {
  test('base contains core editing and AI modules', () => {
    const registry = new ExtensionRegistry(createBaseModules(unusedTransport));
    expect(registry.modules.has('ai')).toBe(true);
    expect(registry.modules.has('card-image')).toBe(false);
    expect(registry.findGlobalTools().map((tool) => tool.id))
      .toEqual(['lua.replace', 'card.showcase-image']);
    expect(registry.taskRunners.has('batch.image.export-card')).toBe(false);
  });

  test('extra adds card image module', () => {
    const registry = new ExtensionRegistry(createExtraModules(unusedTransport));
    expect(registry.modules.has('ai')).toBe(true);
    expect(registry.modules.has('card-image')).toBe(true);
    expect(registry.findCodecForSource('100-card-image.json')?.id)
      .toBe('card-image.json-codec');
    expect(registry.findGlobalTools().map((tool) => tool.id))
      .toContain('card-image.batch-export');
    expect(registry.findGlobalTools().map((tool) => tool.id))
      .toContain('card.showcase-image');
    expect(registry.taskRunners.has('batch.image.export-card')).toBe(true);
    expect(registry.findWorkbenchContributions('card.workbench', 'surface').map((item) => item.metadata?.surfaceId))
      .toEqual(['script', 'image', 'search', 'ai']);
  });
});
