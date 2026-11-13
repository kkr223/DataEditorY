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
import { loadSql } from './sql.ts';

const CDB_PROVIDER_ID = 'cdb.provider';

export class WebDocumentHost {
  private readonly sessions = new Map<string, WebSession>();

  private requireSession(documentId: string) {
    const session = this.sessions.get(documentId);
    if (!session) throw new Error(`Unknown document: ${documentId}`);
    return session;
  }

  private requireProvider(providerId: string) {
    if (providerId !== CDB_PROVIDER_ID) throw new Error(`Unknown provider: ${providerId}`);
  }

  async open(request: HostProviderOpenRequest) {
    this.requireProvider(request.providerId);
    const SQL = await loadSql();
    if (request.create) {
      const cards = Array.isArray(request.input) ? request.input : [];
      const session = createSession(request.documentId, '', new YGOProCdb(SQL), cards);
      this.sessions.set(request.documentId, session);
      return { title: 'Untitled.cdb', metadata: openMetadata(session.db) };
    }
    if (!request.sourceBytes) throw new Error('CDB provider requires source bytes');
    const db = new YGOProCdb(SQL).from(request.sourceBytes);
    const session = openSession(request.documentId, request.sourceUri ?? '', db);
    this.sessions.set(request.documentId, session);
    return {
      title: request.sourceUri?.split(/[\\/]/).filter(Boolean).at(-1) ?? 'cards.cdb',
      metadata: openMetadata(db),
    };
  }

  query(params: HostProviderQueryRequest) {
    this.requireProvider(params.providerId);
    return querySession(this.requireSession(params.documentId), params.query as never);
  }

  execute(params: HostProviderExecuteRequest) {
    this.requireProvider(params.providerId);
    return executeSession(this.requireSession(params.documentId), params.command as never);
  }

  undo(params: HostProviderRequest) {
    this.requireProvider(params.providerId);
    return undoSession(this.requireSession(params.documentId));
  }

  save(params: HostProviderSaveRequest) {
    this.requireProvider(params.providerId);
    return saveSession(this.requireSession(params.documentId), params.destinationUri);
  }

  close(params: HostProviderRequest) {
    this.sessions.delete(params.documentId);
  }
}
