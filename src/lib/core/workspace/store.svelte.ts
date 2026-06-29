import { fromStore } from 'svelte/store';
import { appShellState } from '$lib/stores/appShell.svelte';
import { activeTabId, tabs, type CdbTab } from '$lib/stores/db';
import {
  activeScriptTabId,
  getScriptTabDisplayName,
  scriptTabs,
} from '$lib/stores/scriptEditor.svelte';
import {
  activeTextTabId,
  textTabs,
} from '$lib/stores/textEditor.svelte';
import { documentState } from '$lib/platform/store.svelte';
import { CARD_IMAGE_CONFIG_TYPE } from '$lib/modules/card-image/constants';
import type {
  WorkspaceDocument,
  WorkspaceSnapshot,
} from '$lib/core/workspace/types';
import {
  SETTINGS_WORKSPACE_ID,
  buildWorkspaceDocuments,
  resolveActiveWorkspaceId,
} from '$lib/core/workspace/projection';
import {
  getWorkspaceLifecycleVersionStore,
  resolveWorkspaceLifecycleDocuments,
} from '$lib/application/workspace/lifecycle';

const tabsState = fromStore(tabs);
const activeTabIdState = fromStore(activeTabId);
const scriptTabsState = fromStore(scriptTabs);
const activeScriptTabIdState = fromStore(activeScriptTabId);
const textTabsState = fromStore(textTabs);
const activeTextTabIdState = fromStore(activeTextTabId);
const workspaceLifecycleVersionState = fromStore(getWorkspaceLifecycleVersionStore());

function resolveWorkspaceDocuments() {
  workspaceLifecycleVersionState.current;
  const cardImageDocuments = documentState.documents.filter((document) => (
    document.typeId === CARD_IMAGE_CONFIG_TYPE
  ));

  return resolveWorkspaceLifecycleDocuments(buildWorkspaceDocuments({
    dbTabs: tabsState.current,
    scriptTabs: scriptTabsState.current,
    cardImageDocuments,
    textTabs: textTabsState.current,
    settingsOpen: appShellState.settingsOpen,
    getScriptTitle: getScriptTabDisplayName,
  }));
}

function resolveActiveWorkspace() {
  const cardImageDocuments = documentState.documents.filter((document) => (
    document.typeId === CARD_IMAGE_CONFIG_TYPE
  ));

  return resolveActiveWorkspaceId({
    mainView: appShellState.mainView,
    settingsOpen: appShellState.settingsOpen,
    activeDbTabId: activeTabIdState.current,
    activeScriptTabId: activeScriptTabIdState.current,
    activeTextTabId: activeTextTabIdState.current,
    activeDocumentId: documentState.activeDocumentId,
    cardImageDocuments,
  });
}

export const workspaceState: WorkspaceSnapshot = {
  get documents() {
    return resolveWorkspaceDocuments();
  },
  get activeWorkspaceId() {
    return resolveActiveWorkspace();
  },
};

export function getWorkspaceDocument(id: string | null) {
  if (!id) return null;
  return workspaceState.documents.find((document) => document.id === id) ?? null;
}

export function getActiveWorkspaceDocument() {
  return getWorkspaceDocument(workspaceState.activeWorkspaceId);
}

export function getWorkspaceDocumentsByKind(kind: WorkspaceDocument['kind']) {
  return workspaceState.documents.filter((document) => document.kind === kind);
}

export { SETTINGS_WORKSPACE_ID };
