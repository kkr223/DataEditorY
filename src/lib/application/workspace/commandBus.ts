import { get } from 'svelte/store';
import {
  appShellState,
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
  activeScriptTabId,
} from '$lib/stores/scriptEditor.svelte';
import {
  SETTINGS_WORKSPACE_ID,
  getActiveWorkspaceDocument,
  getWorkspaceDocument,
} from '$lib/core/workspace/store.svelte';
import { tryRunWorkspaceSaveHandler } from '$lib/application/workspace/lifecycle';
import { documentRuntime } from '$lib/platform/appRuntime';
import {
  SETTINGS_PROVIDER_ID,
  SETTINGS_TYPE,
} from '$lib/modules/settings';

function isScriptWorkspace(id: string) {
  return get(scriptTabs).some((tab) => tab.id === id);
}

function getSettingsDocumentId() {
  return documentRuntime.snapshot.documents
    .find((document) => document.typeId === SETTINGS_TYPE)?.id ?? null;
}

export async function openSettingsWorkspace() {
  const existingId = getSettingsDocumentId();
  if (existingId) {
    documentRuntime.activate(existingId);
  } else {
    await documentRuntime.createDocument({
      typeId: SETTINGS_TYPE,
      providerId: SETTINGS_PROVIDER_ID,
      title: 'Settings',
      initialData: {},
    });
  }
  openSettingsView();
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
    void openSettingsWorkspace();
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
    const settingsDocumentId = getSettingsDocumentId();
    if (settingsDocumentId) {
      await documentRuntime.close(settingsDocumentId, true);
    }
    closeSettingsView();
    if (appShellState.mainView === 'script') {
      const scriptId = get(activeScriptTabId);
      if (scriptId && documentRuntime.getDocument(scriptId)) {
        documentRuntime.activate(scriptId);
      }
    } else {
      const dbId = get(activeTabId);
      if (dbId && documentRuntime.getDocument(dbId)) {
        documentRuntime.activate(dbId);
      }
    }
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
