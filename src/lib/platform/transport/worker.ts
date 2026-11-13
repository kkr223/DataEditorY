import { host } from '#lib/platform/host/index.ts';
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
import type { CommandResult } from '../types.ts';

type WorkerResponse = {
  id: number;
  ok: boolean;
  result?: unknown;
  error?: string;
};

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

class WorkerDocumentHostTransport implements DocumentHostTransport {
  private nextId = 0;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly worker: Worker;

  constructor() {
    this.worker = new Worker(new URL('../../web-host/worker.ts', import.meta.url), {
      type: 'module',
      name: 'dataeditory-cdb',
    });
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const response = event.data;
      const pending = this.pending.get(response.id);
      if (!pending) return;
      this.pending.delete(response.id);
      if (response.ok) pending.resolve(response.result);
      else pending.reject(new Error(response.error ?? 'Worker request failed'));
    };
    this.worker.onerror = (event) => {
      const error = new Error(event.message || 'CDB worker crashed');
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
    };
  }

  private call<T>(method: string, params: unknown): Promise<T> {
    const id = ++this.nextId;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      this.worker.postMessage({ id, method, params });
    });
  }

  async open(request: HostProviderOpenRequest) {
    let payload = request;
    if (!request.create && request.sourceUri) {
      const bytes = await host.fs.readBinary(request.sourceUri);
      payload = { ...request, sourceBytes: bytes };
    }
    return this.call<HostProviderOpenResponse>('open', payload);
  }

  query<T>(request: HostProviderQueryRequest) {
    return this.call<T>('query', request);
  }

  execute<T>(request: HostProviderExecuteRequest) {
    return this.call<CommandResult<T>>('execute', request);
  }

  async save(request: HostProviderSaveRequest): Promise<HostProviderSaveResponse> {
    const result = await this.call<HostProviderSaveResponse & { bytes?: Uint8Array }>('save', request);
    if (result.bytes && request.destinationUri) {
      await host.fs.writeBinary(request.destinationUri, result.bytes);
    }
    return { sourceUri: result.sourceUri };
  }

  undo(request: HostProviderRequest) {
    return this.call<CommandResult>('undo', request);
  }

  async close(request: HostProviderRequest) {
    await this.call('close', request);
  }
}

export const documentHostTransport = new WorkerDocumentHostTransport();
