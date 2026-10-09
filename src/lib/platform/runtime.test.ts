import { describe, expect, test } from 'bun:test';
import { MemoryDocumentProvider } from './memoryProvider';
import { DocumentRuntime } from './runtime';
import type { CodecContext, ExtensionModule, ProviderCreateRequest, ProviderOpenRequest } from './types';

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
    expect(runtime.getDocument(created.id)?.title).toBe('saved.note.json');
    expect(runtime.getDocument(created.id)?.source?.path).toBe('D:/saved.note.json');
    expect(runtime.getDocument(created.id)?.dirty).toBe(false);
  });

  test('closing an active workspace prefers a sibling workspace over a child document', async () => {
    const runtime = new DocumentRuntime([
      ...modules,
      {
        id: 'scripts',
        dataTypes: [{ typeId: 'test.script', version: 1, validate: (value) => value }],
        providers: [{
          id: 'scripts.memory',
          typeIds: ['test.script'],
          create: () => new MemoryDocumentProvider(),
        }],
      },
    ], codecContext);
    const first = await runtime.createDocument({
      typeId: 'test.note', providerId: 'memory', title: 'First CDB', initialData: {},
    });
    const second = await runtime.createDocument({
      typeId: 'test.note', providerId: 'memory', title: 'Second CDB', initialData: {},
    });
    const firstScript = await runtime.createDocument({
      typeId: 'test.script', providerId: 'scripts.memory', title: 'First script', initialData: {},
      references: [{ relation: 'card-script', typeId: 'test.note', documentId: first.id }],
    });
    const secondScript = await runtime.createDocument({
      typeId: 'test.script', providerId: 'scripts.memory', title: 'Second script', initialData: {},
      references: [{ relation: 'card-script', typeId: 'test.note', documentId: second.id }],
    });

    runtime.activate(second.id);
    await runtime.close(secondScript.id, true);
    expect(runtime.snapshot.activeDocumentId).toBe(second.id);
    await runtime.close(second.id, true);

    expect(runtime.snapshot.activeDocumentId).toBe(first.id);
    expect(runtime.getDocument(firstScript.id)).not.toBe(null);
    expect(runtime.getDocument(second.id)).toBeNull();

    await runtime.close(first.id, true);
    expect(runtime.snapshot.activeDocumentId).toBe(firstScript.id);
    await runtime.close(firstScript.id, true);
    expect(runtime.snapshot.activeDocumentId).toBeNull();
  });

  test('background opens do not activate either new or already open documents', async () => {
    const runtime = new DocumentRuntime(modules, codecContext);
    const active = await runtime.createDocument({ typeId: 'test.note', providerId: 'memory', title: 'Active' });
    const source = { uri: 'D:/note.note.json', path: 'D:/note.note.json', name: 'note.note.json' };
    const background = await runtime.openSource(source, { activate: false });
    expect(runtime.snapshot.activeDocumentId).toBe(active.id);
    expect((await runtime.openSource(source, { activate: false })).id).toBe(background.id);
    expect(runtime.snapshot.activeDocumentId).toBe(active.id);
  });

  for (const operation of ['open', 'create'] as const) {
    test(`cancelled ${operation} disposes provider data without registering or activating a document`, async () => {
      let started!: () => void;
      const opening = new Promise<void>((resolve) => { started = resolve; });
      let finish!: () => void;
      const blocked = new Promise<void>((resolve) => { finish = resolve; });
      let disposed = 0;
      class SlowProvider extends MemoryDocumentProvider {
        async open(request: ProviderOpenRequest) {
          await super.open(request);
          started();
          await blocked;
        }
        async create(request: ProviderCreateRequest) {
          await super.create(request);
          started();
          await blocked;
        }
        async dispose(id: string) {
          disposed += 1;
          await super.dispose(id);
        }
      }
      const runtime = new DocumentRuntime([...modules, {
        id: 'slow',
        providers: [{ id: 'slow', typeIds: ['test.note'], create: () => new SlowProvider() }],
        codecs: [{
          id: 'slow', typeId: 'test.note', filePatterns: ['.slow'],
          decode: async () => ({ typeId: 'test.note', schemaVersion: 1, title: 'Slow', providerId: 'slow' }),
          encode: async () => {},
        }],
      }], codecContext);
      const active = await runtime.createDocument({ typeId: 'test.note', providerId: 'memory', title: 'Active' });
      const controller = new AbortController();
      const options = { activate: false, signal: controller.signal };
      const pending = operation === 'open'
        ? runtime.openSource({ uri: 'test.slow', name: 'test.slow' }, options)
        : runtime.createDocument({ typeId: 'test.note', providerId: 'slow', title: 'Slow' }, options);
      await opening;
      controller.abort();
      finish();
      const error = await pending.catch((reason: unknown) => reason);
      expect(error).toBeInstanceOf(DOMException);
      expect(disposed).toBe(1);
      expect(runtime.snapshot.documents).toHaveLength(1);
      expect(runtime.snapshot.activeDocumentId).toBe(active.id);
    });
  }
});
