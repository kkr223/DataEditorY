import type {
  HostProviderExecuteRequest,
  HostProviderOpenRequest,
  HostProviderQueryRequest,
  HostProviderRequest,
  HostProviderSaveRequest,
} from '#lib/platform/transport/types.ts';
import { WebDocumentHost } from './host.ts';

type WorkerRequest = {
  id: number;
  method: 'open' | 'query' | 'execute' | 'save' | 'undo' | 'close';
  params: unknown;
};

const host = new WebDocumentHost();

async function handle(request: WorkerRequest) {
  switch (request.method) {
    case 'open':
      return host.open(request.params as HostProviderOpenRequest);
    case 'query':
      return host.query(request.params as HostProviderQueryRequest);
    case 'execute':
      return host.execute(request.params as HostProviderExecuteRequest);
    case 'undo':
      return host.undo(request.params as HostProviderRequest);
    case 'save':
      return host.save(request.params as HostProviderSaveRequest);
    case 'close':
      return host.close(request.params as HostProviderRequest);
  }
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    const result = await handle(request);
    const bytes = (result as { bytes?: Uint8Array } | undefined)?.bytes;
    const message: Record<string, unknown> = { id: request.id, ok: true, result };
    if (bytes) {
      self.postMessage(message, { transfer: [bytes.buffer] } as StructuredSerializeOptions);
      return;
    }
    self.postMessage(message);
  } catch (error) {
    self.postMessage({
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
