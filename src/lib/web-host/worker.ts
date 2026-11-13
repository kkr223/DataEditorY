import initSqlJs from 'sql.js';
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { YGOProCdb } from 'ygopro-cdb-encode';
import type {
  HostProviderExecuteRequest,
  HostProviderOpenRequest,
  HostProviderQueryRequest,
  HostProviderRequest,
  HostProviderSaveRequest,
} from '#lib/platform/transport/types.ts';
import {
  createSession,
  executeSession,
  openMetadata,
  openSession,
  querySession,
  saveSession,
  undoSession,
  type WebSession,
} from './session.ts';

type WorkerRequest = {
  id: number;
  method: 'open' | 'query' | 'execute' | 'save' | 'undo' | 'close';
  params: unknown;
};

const CDB_PROVIDER_ID = 'cdb.provider';
const sessions = new Map<string, WebSession>();
let sqlPromise: ReturnType<typeof initSqlJs> | null = null;

function loadSql() {
  sqlPromise ??= initSqlJs({ locateFile: () => sqlWasmUrl });
  return sqlPromise;
}

function requireSession(documentId: string) {
  const session = sessions.get(documentId);
  if (!session) throw new Error(`Unknown document: ${documentId}`);
  return session;
}

function requireProvider(providerId: string) {
  if (providerId !== CDB_PROVIDER_ID) throw new Error(`Unknown provider: ${providerId}`);
}

async function openDocument(request: HostProviderOpenRequest) {
  requireProvider(request.providerId);
  const SQL = await loadSql();
  if (request.create) {
    const cards = Array.isArray(request.input) ? request.input : [];
    const session = createSession(request.documentId, '', new YGOProCdb(SQL), cards);
    sessions.set(request.documentId, session);
    return { title: 'Untitled.cdb', metadata: openMetadata(session.db) };
  }
  if (!request.sourceBytes) throw new Error('CDB provider requires source bytes');
  const db = new YGOProCdb(SQL).from(request.sourceBytes);
  const session = openSession(request.documentId, request.sourceUri ?? '', db);
  sessions.set(request.documentId, session);
  return {
    title: request.sourceUri?.split(/[\\/]/).filter(Boolean).at(-1) ?? 'cards.cdb',
    metadata: openMetadata(db),
  };
}

async function handle(request: WorkerRequest) {
  switch (request.method) {
    case 'open':
      return openDocument(request.params as HostProviderOpenRequest);
    case 'query': {
      const params = request.params as HostProviderQueryRequest;
      requireProvider(params.providerId);
      return querySession(requireSession(params.documentId), params.query as never);
    }
    case 'execute': {
      const params = request.params as HostProviderExecuteRequest;
      requireProvider(params.providerId);
      return executeSession(requireSession(params.documentId), params.command as never);
    }
    case 'undo': {
      const params = request.params as HostProviderRequest;
      requireProvider(params.providerId);
      return undoSession(requireSession(params.documentId));
    }
    case 'save': {
      const params = request.params as HostProviderSaveRequest;
      requireProvider(params.providerId);
      return saveSession(requireSession(params.documentId), params.destinationUri);
    }
    case 'close': {
      const params = request.params as HostProviderRequest;
      sessions.delete(params.documentId);
      return undefined;
    }
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
