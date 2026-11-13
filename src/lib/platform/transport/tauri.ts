import { invokeCommand } from '../../infrastructure/tauri/index.ts';
import type {
  DocumentHostTransport,
  HostProviderExecuteRequest,
  HostProviderOpenRequest,
  HostProviderOpenResponse,
  HostProviderQueryRequest,
  HostProviderRequest,
  HostProviderSaveRequest,
  HostProviderSaveResponse,
} from '#lib/platform/transport/types.ts';
import type { CommandResult } from '#lib/platform/types.ts';

/** Tauri implementation of the document host protocol. */
export const tauriDocumentHostTransport: DocumentHostTransport = {
  open: (request: HostProviderOpenRequest) => (
    invokeCommand<HostProviderOpenResponse>('provider_open', { request })
  ),
  query: <T>(request: HostProviderQueryRequest) => (
    invokeCommand<T>('provider_query', { request })
  ),
  execute: <T>(request: HostProviderExecuteRequest) => (
    invokeCommand<CommandResult<T>>('provider_execute', { request })
  ),
  save: (request: HostProviderSaveRequest) => (
    invokeCommand<HostProviderSaveResponse>('provider_save', { request })
  ),
  undo: (request: HostProviderRequest) => (
    invokeCommand<CommandResult>('provider_undo', { request })
  ),
  close: (request: HostProviderRequest) => (
    invokeCommand('provider_close', { request })
  ),
};
