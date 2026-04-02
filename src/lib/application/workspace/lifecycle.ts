import { get, writable } from 'svelte/store';
import { _ } from 'svelte-i18n';
import { tauriBridge } from '$lib/infrastructure/tauri';
import type {
  WorkspaceCloseGuard,
  WorkspaceDocument,
  WorkspaceSavePolicy,
  WorkspaceStatus,
} from '$lib/core/workspace/types';

type WorkspaceLifecycleMetadata = {
  dirty?: boolean;
  status?: WorkspaceStatus;
  savePolicy?: WorkspaceSavePolicy;
  closeGuard?: WorkspaceCloseGuard;
};

type WorkspaceSaveHandler = () => boolean | Promise<boolean>;

const workspaceLifecycleVersion = writable(0);
const workspaceLifecycleMetadata = new Map<string, WorkspaceLifecycleMetadata>();
const workspaceSaveHandlers = new Map<string, WorkspaceSaveHandler>();

function bumpWorkspaceLifecycleVersion() {
  workspaceLifecycleVersion.update((value) => value + 1);
}

function translate(key: string, options?: Record<string, unknown>) {
  return String(get(_)(key, options as never));
}

function isSameMetadata(
  current: WorkspaceLifecycleMetadata | undefined,
  next: WorkspaceLifecycleMetadata,
) {
  return current?.dirty === next.dirty
    && current?.status === next.status
    && current?.savePolicy === next.savePolicy
    && current?.closeGuard === next.closeGuard;
}

export function setWorkspaceLifecycleMetadata(id: string, metadata: WorkspaceLifecycleMetadata) {
  const current = workspaceLifecycleMetadata.get(id);
  if (isSameMetadata(current, metadata)) {
    return;
  }

  workspaceLifecycleMetadata.set(id, metadata);
  bumpWorkspaceLifecycleVersion();
}

export function clearWorkspaceLifecycleMetadata(id: string) {
  if (!workspaceLifecycleMetadata.delete(id)) {
    return;
  }

  bumpWorkspaceLifecycleVersion();
}

export function setWorkspaceSaveHandler(id: string, handler: WorkspaceSaveHandler) {
  workspaceSaveHandlers.set(id, handler);
}

export function clearWorkspaceSaveHandler(id: string) {
  workspaceSaveHandlers.delete(id);
}

export function tryRunWorkspaceSaveHandler(id: string) {
  const handler = workspaceSaveHandlers.get(id);
  if (!handler) {
    return null;
  }

  return handler();
}

export function resolveWorkspaceLifecycleDocument<TDocument extends WorkspaceDocument>(
  document: TDocument,
): TDocument {
  const metadata = workspaceLifecycleMetadata.get(document.id);
  if (!metadata) {
    return document;
  }

  return {
    ...document,
    dirty: metadata.dirty ?? document.dirty,
    status: metadata.status ?? document.status,
    savePolicy: metadata.savePolicy ?? document.savePolicy,
    closeGuard: metadata.closeGuard ?? document.closeGuard,
  };
}

export function resolveWorkspaceLifecycleDocuments(documents: WorkspaceDocument[]) {
  return documents.map((document) => resolveWorkspaceLifecycleDocument(document));
}

export function getWorkspaceLifecycleVersionStore() {
  return workspaceLifecycleVersion;
}

export function shouldConfirmWorkspaceClose(document: WorkspaceDocument) {
  return document.closeGuard === 'confirm-dirty' && document.dirty;
}

export function hasDirtyWorkspaceDocuments(documents: WorkspaceDocument[]) {
  return documents.some((document) => document.dirty);
}

export function buildWorkspaceCloseConfirmation(document: WorkspaceDocument) {
  return {
    title: translate('editor.unsaved_close_title'),
    message: translate('editor.unsaved_close_confirm', {
      values: { name: document.title },
    }),
    kind: 'warning' as const,
  };
}

export async function confirmDirtyPrompt(input: {
  title: string;
  message: string;
  kind?: 'warning' | 'info' | 'error';
}) {
  return tauriBridge.ask(input.message, {
    title: input.title,
    kind: input.kind ?? 'warning',
  });
}

export async function confirmWorkspaceClose(document: WorkspaceDocument) {
  if (!shouldConfirmWorkspaceClose(document)) {
    return true;
  }

  const confirmation = buildWorkspaceCloseConfirmation(document);
  return confirmDirtyPrompt(confirmation);
}
