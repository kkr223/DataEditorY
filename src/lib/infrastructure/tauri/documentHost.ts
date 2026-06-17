import { invokeCommand } from './index';
import type {
  CommandResult,
  DataProvider,
  DocumentSource,
  ProviderCreateRequest,
  ProviderOpenRequest,
} from '$lib/platform';

export type ProviderHostRequest = {
  providerId: string;
  documentId: string;
};

export type ProviderOpenResponse = {
  title?: string;
  metadata?: Record<string, unknown>;
};

export const providerOpen = (request: ProviderHostRequest & {
  typeId: string;
  sourceUri?: string;
  create: boolean;
  input?: unknown;
}) => invokeCommand<ProviderOpenResponse>('provider_open', { request });

export const providerQuery = <T = unknown>(
  request: ProviderHostRequest & { query: unknown },
) => invokeCommand<T>('provider_query', { request });

export const providerExecute = <T = unknown>(
  request: ProviderHostRequest & { command: unknown },
) => invokeCommand<CommandResult<T>>('provider_execute', { request });

export const providerSave = (
  request: ProviderHostRequest & { destinationUri?: string },
) => invokeCommand<{ sourceUri: string }>('provider_save', { request });

export const providerUndo = (
  request: ProviderHostRequest,
) => invokeCommand<CommandResult>('provider_undo', { request });

export const providerClose = (
  request: ProviderHostRequest,
) => invokeCommand('provider_close', { request });

export const codecExport = <T = unknown>(
  request: {
    codecId: string;
    documentId?: string;
    sourceUri?: string;
    destinationUri: string;
    options?: unknown;
  },
) => invokeCommand<T>('codec_export', { request });

export class TauriDocumentProvider implements DataProvider {
  constructor(private readonly providerId: string) {}

  async open(request: ProviderOpenRequest) {
    const response = await providerOpen({
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
    const response = await providerOpen({
      providerId: this.providerId,
      documentId: request.documentId,
      typeId: request.typeId,
      create: true,
      input: request.initialData,
    });
    return response.metadata;
  }

  query(documentId: string, query: unknown) {
    return providerQuery({
      providerId: this.providerId,
      documentId,
      query,
    });
  }

  execute(documentId: string, command: unknown) {
    return providerExecute({
      providerId: this.providerId,
      documentId,
      command,
    });
  }

  undo(documentId: string) {
    return providerUndo({
      providerId: this.providerId,
      documentId,
    });
  }

  async dispose(documentId: string) {
    await providerClose({
      providerId: this.providerId,
      documentId,
    });
  }
}

export const saveProviderDocument = async (
  providerId: string,
  documentId: string,
  destination: DocumentSource,
) => providerSave({
  providerId,
  documentId,
  destinationUri: destination.path ?? destination.uri,
});
