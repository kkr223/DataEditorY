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
  test('concurrent saves run in order and close waits for the final write', async () => {
    let release!: () => void;
    let started!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    const writing = new Promise<void>(resolve => { started = resolve; });
    const persisted: string[] = [];
    let writesStarted = 0;
    const runtime = new DocumentRuntime(modules, {
      ...codecContext,
      readText: async () => '{}',
      writeText: async (_path, content) => {
        writesStarted++;
        if (writesStarted === 1) { started(); await blocked; }
        persisted.push(content);
      },
    });
    const doc = await runtime.openSource({ uri: 'D:/queued.note.json', name: 'queued.note.json' });
    try {
      await runtime.execute(doc.id, { kind: 'replace', value: { value: 1 } });
      const first = runtime.save(doc.id);
      await writing;
      await runtime.execute(doc.id, { kind: 'replace', value: { value: 2 } });
      const second = runtime.save(doc.id);
      const closing = runtime.close(doc.id);
      await Promise.resolve();
      expect(writesStarted).toBe(1);
      expect(runtime.getDocument(doc.id)).not.toBe(null);
      release();
      await Promise.all([first, second, closing]);
      expect(persisted).toEqual(['{"value":1}', '{"value":2}']);
      expect(runtime.getDocument(doc.id)).toBeNull();
    } finally { release(); }
  });

  test('saving keeps edits made during file writing dirty', async () => {
    let finish!: () => void;
    let started!: () => void;
    const blocked = new Promise<void>(resolve => { finish = resolve; });
    const writing = new Promise<void>(resolve => { started = resolve; });
    const persisted: string[] = [];
    const runtime = new DocumentRuntime(modules, {
      ...codecContext,
      readText: async () => '{}',
      writeText: async (_path, content) => {
        if (persisted.length === 0) { started(); await blocked; }
        persisted.push(content);
      },
    });
    const doc = await runtime.openSource({ uri: 'D:/race.note.json', name: 'race.note.json' });
    await runtime.execute(doc.id, { kind: 'replace', value: { value: 'first' } });
    const firstSave = runtime.save(doc.id);
    await writing;
    await runtime.execute(doc.id, { kind: 'replace', value: { value: 'second' } });
    finish();
    await firstSave;
    expect(runtime.getDocument(doc.id)?.dirty).toBe(true);
    expect(persisted).toEqual(['{"value":"first"}']);
    await runtime.save(doc.id);
    expect(persisted).toEqual(['{"value":"first"}', '{"value":"second"}']);
    expect(runtime.getDocument(doc.id)?.dirty).toBe(false);
    await runtime.close(doc.id);
  });

  test('moving tabs survives runtime updates and closing follows the displayed order', async () => {
    const runtime = new DocumentRuntime(modules, codecContext);
    const create = (title: string) => runtime.createDocument({
      typeId: 'test.note', providerId: 'memory', title, initialData: {},
    });
    const first = await create('First');
    const second = await create('Second');
    const third = await create('Third');
    runtime.activate(first.id);
    runtime.moveDocument(third.id, first.id, 'before');
    expect(runtime.snapshot.documents.map((item) => item.id)).toEqual([third.id, first.id, second.id]);
    expect(runtime.snapshot.activeDocumentId).toBe(first.id);
    expect(runtime.getDocument(third.id)).toEqual(third);
    await runtime.execute(first.id, { kind: 'patch', value: { edited: true } });
    expect(runtime.snapshot.documents.map((item) => item.id)).toEqual([third.id, first.id, second.id]);
    runtime.moveDocument(third.id, second.id, 'after');
    expect(runtime.snapshot.documents.map((item) => item.id)).toEqual([first.id, second.id, third.id]);
    runtime.activate(second.id);
    await runtime.close(second.id, true);
    expect(runtime.snapshot.activeDocumentId).toBe(third.id);
  });

  test('stale or redundant tab moves leave the runtime unchanged', async () => {
    const runtime = new DocumentRuntime(modules, codecContext);
    const first = await runtime.createDocument({ typeId: 'test.note', providerId: 'memory', title: 'First' });
    const second = await runtime.createDocument({ typeId: 'test.note', providerId: 'memory', title: 'Second' });
    let emissions = 0;
    const unsubscribe = runtime.subscribe(() => { emissions += 1; });
    runtime.moveDocument(first.id, first.id, 'after');
    runtime.moveDocument(first.id, second.id, 'before');
    runtime.moveDocument('closed', second.id, 'after');
    runtime.moveDocument(second.id, 'closed', 'before');
    expect(emissions).toBe(1);
    expect(runtime.snapshot.documents.map((item) => item.id)).toEqual([first.id, second.id]);
    unsubscribe();
  });

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
