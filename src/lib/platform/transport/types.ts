import type { CommandResult } from '../types.ts';

export type HostProviderRequest = {
  providerId: string;
  documentId: string;
};

export type HostProviderOpenRequest = HostProviderRequest & {
  typeId: string;
  sourceUri?: string;
  create: boolean;
  input?: unknown;
  /** Raw source bytes; only used by the web transport. */
  sourceBytes?: Uint8Array;
};

export type HostProviderOpenResponse = {
  title?: string;
  metadata?: Record<string, unknown>;
};

export type HostProviderQueryRequest = HostProviderRequest & {
  query: unknown;
};

export type HostProviderExecuteRequest = HostProviderRequest & {
  command: unknown;
};

export type HostProviderSaveRequest = HostProviderRequest & {
  destinationUri?: string;
};

export type HostProviderSaveResponse = {
  sourceUri: string;
};

/**
 * Transport for the document host protocol.
 *
 * Tauri implements this with `invoke`; the web build implements the same
 * request/response shapes over a Web Worker. The UI must not depend on which
 * implementation is active.
 */
export interface DocumentHostTransport {
  open(request: HostProviderOpenRequest): Promise<HostProviderOpenResponse>;
  query<T = unknown>(request: HostProviderQueryRequest): Promise<T>;
  execute<T = unknown>(request: HostProviderExecuteRequest): Promise<CommandResult<T>>;
  save(request: HostProviderSaveRequest): Promise<HostProviderSaveResponse>;
  undo(request: HostProviderRequest): Promise<CommandResult>;
  close(request: HostProviderRequest): Promise<void>;
}
