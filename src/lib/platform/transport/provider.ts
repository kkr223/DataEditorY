import type { DataProvider, ProviderCreateRequest, ProviderOpenRequest } from '../types.ts';
import type { DocumentHostTransport } from './types.ts';

/**
 * Document host provider shared by every transport implementation.
 * Keeps the platform-specific `invoke` / `postMessage` detail out of modules.
 */
export class DocumentHostProvider implements DataProvider {
  constructor(
    private readonly providerId: string,
    private readonly transport: DocumentHostTransport,
  ) {}

  async open(request: ProviderOpenRequest) {
    const response = await this.transport.open({
      providerId: this.providerId,
      documentId: request.documentId,
      typeId: request.typeId,
      sourceUri: request.source?.path ?? request.source?.uri,
      create: false,
      input: request.input,
    });
    return response.metadata;
  }

  async create(request: ProviderCreateRequest) {
    const response = await this.transport.open({
      providerId: this.providerId,
      documentId: request.documentId,
      typeId: request.typeId,
      create: true,
      input: request.initialData,
    });
    return response.metadata;
  }

  query(documentId: string, query: unknown) {
    return this.transport.query({
      providerId: this.providerId,
      documentId,
      query,
    });
  }

  execute(documentId: string, command: unknown) {
    return this.transport.execute({
      providerId: this.providerId,
      documentId,
      command,
    });
  }

  undo(documentId: string) {
    return this.transport.undo({
      providerId: this.providerId,
      documentId,
    });
  }

  async save(documentId: string, destination: { path?: string; uri: string }) {
    await this.transport.save({
      providerId: this.providerId,
      documentId,
      destinationUri: destination.path ?? destination.uri,
    });
  }

  async dispose(documentId: string) {
    await this.transport.close({
      providerId: this.providerId,
      documentId,
    });
  }
}
