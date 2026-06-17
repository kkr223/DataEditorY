import { describe, expect, test } from 'bun:test';
import { MemoryDocumentProvider } from './memoryProvider';
import { DocumentRuntime } from './runtime';
import type { CodecContext, ExtensionModule } from './types';

const files = new Map<string, string>([['D:/note.note.json', '{"value":1}']]);
const codecContext: CodecContext = {
  readText: async (path) => files.get(path) ?? '',
  writeText: async (path, content) => { files.set(path, content); },
  readBinary: async () => new Uint8Array(),
  writeBinary: async () => {},
};

const modules: ExtensionModule[] = [{
  id: 'notes',
  dataTypes: [{
    typeId: 'test.note',
    version: 1,
    validate(value) {
      if (!value || typeof value !== 'object') throw new Error('Invalid note');
      return value;
    },
  }],
  providers: [{
    id: 'memory',
    typeIds: ['test.note'],
    create: () => new MemoryDocumentProvider(),
  }],
  codecs: [{
    id: 'note-json',
    typeId: 'test.note',
    filePatterns: ['*.note.json'],
    async decode(source, context) {
      return {
        typeId: 'test.note',
        schemaVersion: 1,
        title: source.name,
        providerId: 'memory',
        providerInput: JSON.parse(await context.readText(source.path ?? source.uri)),
      };
    },
    async encode(document, destination, context) {
      await context.writeText(
        destination.path ?? destination.uri,
        JSON.stringify(await document.snapshot()),
      );
    },
  }],
  workbenches: [{
    id: 'note-workbench',
    acceptedTypeIds: ['test.note'],
    component: async () => ({}),
  }],
}];

describe('document runtime', () => {
  test('opens, modifies, saves, and closes a document', async () => {
    const runtime = new DocumentRuntime(modules, codecContext);
    const opened = await runtime.openSource({
      uri: 'file:///D:/note.note.json',
      path: 'D:/note.note.json',
      name: 'note.note.json',
    });

    expect(await runtime.query(opened.id, {})).toEqual({ value: 1 });
    await runtime.execute(opened.id, { kind: 'patch', value: { value: 2 } });
    expect(runtime.getDocument(opened.id)?.dirty).toBe(true);

    await runtime.save(opened.id);
    expect(files.get('D:/note.note.json')).toBe('{"value":2}');
    expect(runtime.getDocument(opened.id)?.dirty).toBe(false);

    await runtime.close(opened.id);
    expect(runtime.snapshot.documents).toHaveLength(0);
  });

  test('requires force to close dirty documents and supports save as', async () => {
    const runtime = new DocumentRuntime(modules, codecContext);
    const created = await runtime.createDocument({
      typeId: 'test.note',
      providerId: 'memory',
      title: 'Untitled',
      initialData: { value: 3 },
    });

    let closeError: unknown = null;
    try {
      await runtime.close(created.id);
    } catch (error) {
      closeError = error;
    }
    expect(closeError).toBeInstanceOf(Error);
    expect((closeError as Error).message).toContain('unsaved changes');
    await runtime.save(created.id, {
      uri: 'file:///D:/saved.note.json',
      path: 'D:/saved.note.json',
      name: 'saved.note.json',
    });
    expect(files.get('D:/saved.note.json')).toBe('{"value":3}');
  });
});
