import { describe, expect, test } from 'bun:test';
import { ExtensionRegistry } from './registry';
import { MemoryDocumentProvider } from './memoryProvider';
import type { ExtensionModule } from './types';

const type = {
  typeId: 'test.document',
  version: 1,
  validate: (value: unknown) => value,
};

const provider = {
  id: 'memory',
  typeIds: ['test.document'],
  create: () => new MemoryDocumentProvider(),
};

const module = (overrides: Partial<ExtensionModule> = {}): ExtensionModule => ({
  id: 'test',
  dataTypes: [type],
  providers: [provider],
  ...overrides,
});

describe('extension registry', () => {
  test('registers data types, providers, codecs, and workbenches', () => {
    const registry = new ExtensionRegistry([module({
      codecs: [{
        id: 'test-json',
        typeId: 'test.document',
        filePatterns: ['.test.json'],
        decode: async () => ({
          typeId: 'test.document',
          schemaVersion: 1,
          title: 'Test',
          providerId: 'memory',
        }),
        encode: async () => {},
      }],
      workbenches: [{
        id: 'test-workbench',
        acceptedTypeIds: ['test.document'],
        component: async () => ({}),
      }],
    })]);

    expect(registry.findCodecForSource('D:/demo.test.json')?.id).toBe('test-json');
    expect(registry.findWorkbench('test.document')?.id).toBe('test-workbench');
  });

  test('rejects duplicate ids and codec patterns', () => {
    expect(() => new ExtensionRegistry([module(), module()])).toThrow('Duplicate module id');
    expect(() => new ExtensionRegistry([module({
      codecs: [
        {
          id: 'one',
          typeId: 'test.document',
          filePatterns: ['.json'],
          decode: async () => ({ typeId: 'test.document', schemaVersion: 1, title: '', providerId: 'memory' }),
          encode: async () => {},
        },
        {
          id: 'two',
          typeId: 'test.document',
          filePatterns: ['.JSON'],
          decode: async () => ({ typeId: 'test.document', schemaVersion: 1, title: '', providerId: 'memory' }),
          encode: async () => {},
        },
      ],
    })])).toThrow('Codec pattern');
  });

  test('rejects missing module dependencies and unknown type references', () => {
    expect(() => new ExtensionRegistry([module({ dependencies: ['missing'] })]))
      .toThrow('requires missing module');
    expect(() => new ExtensionRegistry([module({
      providers: [{ ...provider, typeIds: ['unknown'] }],
    })])).toThrow('references unknown data type');
  });
});
