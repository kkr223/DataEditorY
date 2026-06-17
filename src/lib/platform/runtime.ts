import { ExtensionRegistry } from './registry';
import type {
  CodecContext,
  CommandResult,
  DocumentAccess,
  DataProvider,
  DocumentRecord,
  DocumentRef,
  DocumentRuntimeSnapshot,
  DocumentSource,
  ExtensionModule,
  PlatformCommandContext,
} from './types';

type RuntimeListener = (snapshot: DocumentRuntimeSnapshot) => void;

export type CreateDocumentRequest = {
  typeId: string;
  providerId: string;
  title: string;
  initialData?: unknown;
  references?: DocumentRef[];
  metadata?: Record<string, unknown>;
};

export class DocumentRuntime {
  readonly registry: ExtensionRegistry;

  private readonly providerInstances = new Map<string, DataProvider>();
  private readonly documents = new Map<string, DocumentRecord>();
  private readonly listeners = new Set<RuntimeListener>();
  private activeDocumentId: string | null = null;

  constructor(
    modules: ExtensionModule[],
    private readonly codecContext: CodecContext,
  ) {
    this.registry = new ExtensionRegistry(modules);
  }

  get snapshot(): DocumentRuntimeSnapshot {
    return {
      documents: [...this.documents.values()].map((document) => this.cloneRecord(document)),
      activeDocumentId: this.activeDocumentId,
    };
  }

  subscribe(listener: RuntimeListener) {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  getDocument(id: string) {
    const document = this.documents.get(id);
    return document ? this.cloneRecord(document) : null;
  }

  getActiveDocument() {
    return this.activeDocumentId ? this.getDocument(this.activeDocumentId) : null;
  }

  activate(id: string) {
    this.requireDocument(id);
    this.activeDocumentId = id;
    this.emit();
  }

  async openSource(source: DocumentSource) {
    const existing = [...this.documents.values()].find((document) => document.source?.uri === source.uri);
    if (existing) {
      this.activate(existing.id);
      return this.cloneRecord(existing);
    }

    const codec = this.registry.findCodecForSource(source.path ?? source.uri);
    if (!codec) {
      throw new Error(`No codec registered for ${source.name}`);
    }
    const opened = await codec.decode(source, this.codecContext);
    if (opened.typeId !== codec.typeId) {
      throw new Error(`Codec ${codec.id} returned unexpected data type ${opened.typeId}`);
    }

    const id = crypto.randomUUID();
    const provider = this.requireProvider(opened.providerId, opened.typeId);
    const providerMetadata = await provider.open({
      documentId: id,
      typeId: opened.typeId,
      source,
      input: opened.providerInput,
    });
    const record: DocumentRecord = {
      id,
      typeId: opened.typeId,
      schemaVersion: opened.schemaVersion,
      title: opened.title,
      source,
      codecId: codec.id,
      providerId: opened.providerId,
      savePolicy: this.registry.providers.get(opened.providerId)?.savePolicy ?? 'manual',
      dirty: false,
      revision: 0,
      savedRevision: 0,
      references: opened.references ?? [],
      metadata: {
        ...(opened.metadata ?? {}),
        ...(providerMetadata ?? {}),
      },
    };
    this.documents.set(id, record);
    this.activeDocumentId = id;
    this.emit();
    return this.cloneRecord(record);
  }

  async createDocument(request: CreateDocumentRequest) {
    const type = this.registry.dataTypes.get(request.typeId);
    if (!type) {
      throw new Error(`Unknown data type: ${request.typeId}`);
    }
    if (request.initialData !== undefined) {
      type.validate(request.initialData);
    }
    const id = crypto.randomUUID();
    const provider = this.requireProvider(request.providerId, request.typeId);
    if (!provider.create) {
      throw new Error(`Provider ${request.providerId} cannot create documents`);
    }
    const providerMetadata = await provider.create({
      documentId: id,
      typeId: request.typeId,
      initialData: request.initialData,
    });
    const savePolicy = this.registry.providers.get(request.providerId)?.savePolicy ?? 'manual';
    const record: DocumentRecord = {
      id,
      typeId: request.typeId,
      schemaVersion: type.version,
      title: request.title,
      source: null,
      codecId: null,
      providerId: request.providerId,
      savePolicy,
      dirty: savePolicy === 'manual',
      revision: 0,
      savedRevision: savePolicy === 'automatic' ? 0 : -1,
      references: request.references ?? [],
      metadata: {
        ...(request.metadata ?? {}),
        ...(providerMetadata ?? {}),
      },
    };
    this.documents.set(id, record);
    this.activeDocumentId = id;
    this.emit();
    return this.cloneRecord(record);
  }

  async query<T = unknown>(documentId: string, query: unknown): Promise<T> {
    const document = this.requireDocument(documentId);
    const provider = this.requireProvider(document.providerId, document.typeId);
    return provider.query(documentId, query) as Promise<T>;
  }

  async execute<T = unknown>(documentId: string, command: unknown): Promise<CommandResult<T>> {
    const document = this.requireDocument(documentId);
    const provider = this.requireProvider(document.providerId, document.typeId);
    const result = await provider.execute(documentId, command) as CommandResult<T>;
    if (result.changed) {
      document.revision += 1;
      if (document.savePolicy === 'automatic') {
        document.savedRevision = document.revision;
        document.dirty = false;
      } else {
        document.dirty = document.revision !== document.savedRevision;
      }
      this.emit();
    }
    return result;
  }

  async executePlatformCommand<T = unknown>(commandId: string, input: unknown): Promise<T> {
    const command = this.registry.commands.get(commandId);
    if (!command) {
      throw new Error(`Unknown platform command: ${commandId}`);
    }
    const context: PlatformCommandContext = {
      getDocument: (id) => this.getDocument(id),
      query: (id, query) => this.query(id, query),
      execute: (id, value) => this.execute(id, value),
    };
    return command.execute(context, input) as Promise<T>;
  }

  async undo(documentId: string) {
    const document = this.requireDocument(documentId);
    const provider = this.requireProvider(document.providerId, document.typeId);
    if (!provider.undo) {
      return { changed: false } satisfies CommandResult;
    }
    const result = await provider.undo(documentId);
    if (result.changed) {
      document.revision += 1;
      if (document.savePolicy === 'automatic') {
        document.savedRevision = document.revision;
        document.dirty = false;
      } else {
        document.dirty = document.revision !== document.savedRevision;
      }
      this.emit();
    }
    return result;
  }

  async save(documentId: string, destination?: DocumentSource) {
    const document = this.requireDocument(documentId);
    const target = destination ?? document.source;
    if (!target) {
      throw new Error(`Document ${document.title} needs a destination`);
    }
    const codec = destination
      ? this.registry.findCodecForSource(target.path ?? target.uri)
      : document.codecId
        ? this.registry.codecs.get(document.codecId)
        : null;
    if (!codec) {
      throw new Error(`No codec available to save ${target.name}`);
    }
    if (codec.typeId !== document.typeId) {
      throw new Error(`Codec ${codec.id} cannot save data type ${document.typeId}`);
    }

    await codec.encode(this.createAccess(document), target, this.codecContext);
    document.source = target;
    document.codecId = codec.id;
    document.savedRevision = document.revision;
    document.dirty = false;
    this.emit();
    return this.cloneRecord(document);
  }

  async close(documentId: string, force = false) {
    const document = this.requireDocument(documentId);
    if (document.dirty && !force) {
      throw new Error(`Document ${document.title} has unsaved changes`);
    }
    const provider = this.requireProvider(document.providerId, document.typeId);
    await provider.dispose(documentId);
    const ids = [...this.documents.keys()];
    const index = ids.indexOf(documentId);
    this.documents.delete(documentId);
    if (this.activeDocumentId === documentId) {
      const nextIds = [...this.documents.keys()];
      this.activeDocumentId = nextIds[Math.min(index, nextIds.length - 1)] ?? null;
    }
    this.emit();
  }

  setReferences(documentId: string, references: DocumentRef[]) {
    const document = this.requireDocument(documentId);
    document.references = structuredClone(references);
    this.emit();
  }

  patchMetadata(documentId: string, metadata: Record<string, unknown>) {
    const document = this.requireDocument(documentId);
    document.metadata = {
      ...document.metadata,
      ...structuredClone(metadata),
    };
    this.emit();
  }

  private createAccess(document: DocumentRecord): DocumentAccess {
    return {
      record: this.cloneRecord(document),
      query: (query) => this.query(document.id, query),
      snapshot: async <T = unknown>() => {
        const provider = this.requireProvider(document.providerId, document.typeId);
        if (!provider.snapshot) {
          throw new Error(`Provider ${document.providerId} does not support snapshots`);
        }
        return provider.snapshot(document.id) as Promise<T>;
      },
    };
  }

  private requireDocument(id: string) {
    const document = this.documents.get(id);
    if (!document) {
      throw new Error(`Unknown document: ${id}`);
    }
    return document;
  }

  private requireProvider(providerId: string, typeId: string) {
    const descriptor = this.registry.providers.get(providerId);
    if (!descriptor) {
      throw new Error(`Unknown provider: ${providerId}`);
    }
    if (!descriptor.typeIds.includes(typeId)) {
      throw new Error(`Provider ${providerId} does not support ${typeId}`);
    }
    let provider = this.providerInstances.get(providerId);
    if (!provider) {
      provider = descriptor.create();
      this.providerInstances.set(providerId, provider);
    }
    return provider;
  }

  private cloneRecord(record: DocumentRecord) {
    return structuredClone(record);
  }

  private emit() {
    const snapshot = this.snapshot;
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}
