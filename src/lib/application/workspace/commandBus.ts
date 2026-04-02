import { get } from 'svelte/store';
import {
  activateEditorView,
  closeSettingsView,
  openSettingsView,
} from '$lib/stores/appShell.svelte';
import {
  activeTabId,
  closeTab,
  createCdbFile,
  openCdbFile,
  saveCdbTab,
} from '$lib/stores/db';
import {
  activateScriptTab,
  closeScriptTab,
  saveScriptTab,
  scriptTabs,
} from '$lib/stores/scriptEditor.svelte';
import {
  SETTINGS_WORKSPACE_ID,
  getActiveWorkspaceDocument,
  getWorkspaceDocument,
} from '$lib/core/workspace/store.svelte';
import { tryRunWorkspaceSaveHandler } from '$lib/application/workspace/lifecycle';

function isScriptWorkspace(id: string) {
  return get(scriptTabs).some((tab) => tab.id === id);
}

export async function openDbWorkspace() {
  const openedId = await openCdbFile();
  if (openedId) {
    activateEditorView();
  }
  return openedId;
}

export async function createDbWorkspace() {
  const openedId = await createCdbFile();
  if (openedId) {
    activateEditorView();
  }
  return openedId;
}

export function activateWorkspaceDocument(id: string) {
  if (id === SETTINGS_WORKSPACE_ID) {
    openSettingsView();
    return;
  }

  if (isScriptWorkspace(id)) {
    activateScriptTab(id);
    return;
  }

  activeTabId.set(id);
  activateEditorView();
}

export async function closeWorkspaceDocument(id: string) {
  if (id === SETTINGS_WORKSPACE_ID) {
    closeSettingsView();
    return;
  }

  if (isScriptWorkspace(id)) {
    closeScriptTab(id);
    return;
  }

  await closeTab(id);
}

export async function saveWorkspaceDocument(id: string) {
  const customSaveResult = await tryRunWorkspaceSaveHandler(id);
  if (customSaveResult !== null) {
    return customSaveResult;
  }

  if (id === SETTINGS_WORKSPACE_ID) {
    return true;
  }

  if (isScriptWorkspace(id)) {
    return saveScriptTab(id);
  }

  return saveCdbTab(id);
}

export async function saveActiveWorkspaceDocument() {
  const activeWorkspace = getActiveWorkspaceDocument();
  if (!activeWorkspace) return false;
  return saveWorkspaceDocument(activeWorkspace.id);
}

export function getWorkspaceDocumentOrThrow(id: string) {
  const workspace = getWorkspaceDocument(id);
  if (!workspace) {
    throw new Error(`Unknown workspace: ${id}`);
  }
  return workspace;
}
