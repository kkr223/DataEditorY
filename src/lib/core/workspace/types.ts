import type { CdbTab } from '$lib/stores/db';
import type { ScriptWorkspaceState } from '$lib/types';

export type WorkspaceKind = 'db' | 'script' | 'settings';
export type WorkspaceStatus = 'ready' | 'busy';
export type WorkspaceSavePolicy = 'manual' | 'none';
export type WorkspaceCloseGuard = 'confirm-dirty' | 'none';

export interface WorkspaceDocumentBase {
  id: string;
  kind: WorkspaceKind;
  title: string;
  subtitle: string;
  dirty: boolean;
  status: WorkspaceStatus;
  savePolicy: WorkspaceSavePolicy;
  closeGuard: WorkspaceCloseGuard;
  source: {
    path: string | null;
    tabId: string | null;
  };
  viewState: Record<string, unknown> | null;
}

export interface DbWorkspaceDocument extends WorkspaceDocumentBase {
  kind: 'db';
  source: {
    path: string;
    tabId: string;
  };
  legacy: CdbTab;
}

export interface ScriptWorkspaceDocument extends WorkspaceDocumentBase {
  kind: 'script';
  source: {
    path: string;
    tabId: string | null;
  };
  legacy: ScriptWorkspaceState;
}

export interface SettingsWorkspaceDocument extends WorkspaceDocumentBase {
  kind: 'settings';
}

export type WorkspaceDocument =
  | DbWorkspaceDocument
  | ScriptWorkspaceDocument
  | SettingsWorkspaceDocument;

export interface WorkspaceSnapshot {
  documents: WorkspaceDocument[];
  activeWorkspaceId: string | null;
}
