import { host } from '#lib/platform/host/index.ts';
import { WebDocumentHost } from '#lib/web-host/host.ts';
import type { CommandResult } from '../types.ts';
import type {
  DocumentHostTransport,
  HostProviderExecuteRequest,
  HostProviderOpenRequest,
  HostProviderOpenResponse,
  HostProviderQueryRequest,
  HostProviderRequest,
  HostProviderSaveRequest,
  HostProviderSaveResponse,
} from './types.ts';

/**
 * Main-thread transport for the standalone (file://) build, where module
 * workers cannot be loaded. Speaks the same protocol as the worker transport.
 */
class InlineDocumentHostTransport implements DocumentHostTransport {
  private readonly documentHost = new WebDocumentHost();

  async open(request: HostProviderOpenRequest) {
    let payload = request;
    if (!request.create && request.sourceUri) {
      payload = { ...request, sourceBytes: await host.fs.readBinary(request.sourceUri) };
    }
    return (await this.documentHost.open(payload)) as HostProviderOpenResponse;
  }

  async query<T>(request: HostProviderQueryRequest) {
    return this.documentHost.query(request) as T;
  }

  async execute<T>(request: HostProviderExecuteRequest) {
    return this.documentHost.execute(request) as CommandResult<T>;
  }

  async save(request: HostProviderSaveRequest): Promise<HostProviderSaveResponse> {
    const result = this.documentHost.save(request);
    if (result.bytes && request.destinationUri) {
      await host.fs.writeBinary(request.destinationUri, result.bytes);
    }
    return { sourceUri: result.sourceUri };
  }

  async undo(request: HostProviderRequest) {
    return this.documentHost.undo(request) as CommandResult;
  }

  async close(request: HostProviderRequest) {
    this.documentHost.close(request);
  }
}

export const documentHostTransport = new InlineDocumentHostTransport();
