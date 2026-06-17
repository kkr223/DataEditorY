import type {
  CommandResult,
  DataProvider,
  ProviderCreateRequest,
  ProviderOpenRequest,
} from './types';

export type MemoryProviderCommand =
  | { kind: 'replace'; value: unknown }
  | { kind: 'patch'; value: Record<string, unknown> };

export class MemoryDocumentProvider implements DataProvider {
  private readonly documents = new Map<string, unknown>();

  async open(request: ProviderOpenRequest) {
    this.documents.set(request.documentId, request.input ?? null);
  }

  async create(request: ProviderCreateRequest) {
    this.documents.set(request.documentId, request.initialData ?? null);
  }

  async query(documentId: string) {
    return this.requireDocument(documentId);
  }

  async execute(documentId: string, rawCommand: unknown): Promise<CommandResult> {
    const command = rawCommand as MemoryProviderCommand;
    const current = this.requireDocument(documentId);
    if (command.kind === 'replace') {
      this.documents.set(documentId, structuredClone(command.value));
      return { changed: true };
    }
    if (command.kind === 'patch' && current && typeof current === 'object' && !Array.isArray(current)) {
      this.documents.set(documentId, {
        ...current,
        ...structuredClone(command.value),
      });
      return { changed: true };
    }
    throw new Error(`Unsupported memory provider command: ${String(command?.kind)}`);
  }

  async snapshot(documentId: string) {
    return structuredClone(this.requireDocument(documentId));
  }

  async dispose(documentId: string) {
    this.documents.delete(documentId);
  }

  private requireDocument(documentId: string) {
    if (!this.documents.has(documentId)) {
      throw new Error(`Unknown memory document: ${documentId}`);
    }
    return this.documents.get(documentId);
  }
}
