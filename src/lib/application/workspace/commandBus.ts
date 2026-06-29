import { get } from 'svelte/store';
import { tick } from 'svelte';
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
  saveCdbTabAs,
  tabs,
} from '$lib/stores/db';
import {
  activateScriptTab,
  closeScriptTab,
  closeScriptTabsForCdb,
  getScriptTabsForCdb,
  saveScriptTab,
  scriptTabs,
  activeScriptTabId,
} from '$lib/stores/scriptEditor.svelte';
import { tauriBridge } from '$lib/infrastructure/tauri';
import {
  SETTINGS_WORKSPACE_ID,
  getActiveWorkspaceDocument,
  getWorkspaceDocument,
} from '$lib/core/workspace/store.svelte';
import {
  clearWorkspaceLifecycleMetadata,
  confirmWorkspaceClose,
  tryRunWorkspaceSaveHandler,
} from '$lib/application/workspace/lifecycle';
import { documentRuntime } from '$lib/platform/appRuntime';
import {
  SETTINGS_PROVIDER_ID,
  SETTINGS_TYPE,
} from '$lib/modules/settings';
import { CARD_IMAGE_CONFIG_TYPE } from '$lib/modules/card-image/constants';
import { copyWorkspaceMetadataForSaveAs } from '$lib/modules/card/workbench/workspaceMetadataState.svelte';
import { clearWorkspaceCardDraft } from '$lib/modules/card/workbench/cardDraftWorkspaceState.svelte';
import {
  activateTextTab,
  closeTextTab,
  isTextWorkspace,
  saveTextTab,
  saveTextTabAs,
} from '$lib/stores/textEditor.svelte';

function isScriptWorkspace(id: string) {
  return get(scriptTabs).some((tab) => tab.id === id);
}

function getSettingsDocumentId() {
  return documentRuntime.snapshot.documents
    .find((document) => document.typeId === SETTINGS_TYPE)?.id ?? null;
}

function isCardImageWorkspace(id: string) {
  return documentRuntime.getDocument(id)?.typeId === CARD_IMAGE_CONFIG_TYPE;
}

async function activateCdbWorkspaceForLifecycle(id: string) {
  if (get(activeTabId) === id) return;
  activeTabId.set(id);
  activateEditorView();
  await tick();
}

async function saveCardImageWorkspace(id: string) {
  const document = documentRuntime.getDocument(id);
  if (!document || document.typeId !== CARD_IMAGE_CONFIG_TYPE) {
    return false;
  }

  try {
    if (document.source) {
      await documentRuntime.save(id);
      return true;
    }

    const targetPath = await tauriBridge.save({
      defaultPath: document.title.endsWith('.json') ? document.title : `${document.title}.json`,
      filters: [{ name: 'Card image config', extensions: ['json'] }],
    });
    if (!targetPath) return false;

    await documentRuntime.save(id, {
      uri: targetPath,
      path: targetPath,
      name: targetPath.split(/[\\/]/).pop() || document.title,
    });
    return true;
  } catch (error) {
    console.error('Failed to save card image workspace:', error);
    return false;
  }
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

  if (isTextWorkspace(id)) {
    activateTextTab(id);
    return;
  }

  if (isScriptWorkspace(id)) {
    activateScriptTab(id);
    return;
  }

  if (isCardImageWorkspace(id)) {
    documentRuntime.activate(id);
    activateEditorView();
    return;
  }

  activeTabId.set(id);
  documentRuntime.activate(id);
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
    return true;
  }

  if (isScriptWorkspace(id)) {
    await closeScriptTab(id);
    return true;
  }

  if (isTextWorkspace(id)) {
    await closeTextTab(id);
    clearWorkspaceLifecycleMetadata(id);
    return true;
  }

  if (isCardImageWorkspace(id)) {
    await documentRuntime.close(id, true);
    return true;
  }

  const dbTab = get(tabs).find((tab) => tab.id === id);
  if (!dbTab) return false;
  const ownedScriptTabs = getScriptTabsForCdb({ tabId: id, path: dbTab.path });
  for (const scriptTab of ownedScriptTabs) {
    const workspace = getWorkspaceDocument(scriptTab.id);
    if (workspace && !(await confirmWorkspaceClose(workspace))) {
      return false;
    }
  }

  await closeScriptTabsForCdb({ tabId: id, path: dbTab.path });
  await closeTab(id);
  await tick();
  clearWorkspaceCardDraft(id);
  clearWorkspaceLifecycleMetadata(id);
  return true;
}

export async function saveWorkspaceDocument(id: string) {
  if (id === SETTINGS_WORKSPACE_ID) {
    return true;
  }

  if (isScriptWorkspace(id)) {
    const customSaveResult = await tryRunWorkspaceSaveHandler(id);
    if (customSaveResult !== null) return customSaveResult;
    return saveScriptTab(id);
  }

  if (isTextWorkspace(id)) {
    const customSaveResult = await tryRunWorkspaceSaveHandler(id);
    if (customSaveResult !== null) return customSaveResult;
    return saveTextTab(id);
  }

  if (isCardImageWorkspace(id)) {
    const customSaveResult = await tryRunWorkspaceSaveHandler(id);
    if (customSaveResult !== null) return customSaveResult;
    return saveCardImageWorkspace(id);
  }

  await activateCdbWorkspaceForLifecycle(id);
  const customSaveResult = await tryRunWorkspaceSaveHandler(id);
  if (customSaveResult !== null) return customSaveResult;
  return saveCdbTab(id);
}

export async function saveWorkspaceDocumentAs(id: string) {
  if (isTextWorkspace(id)) {
    return saveTextTabAs(id);
  }

  const tab = get(tabs).find((item) => item.id === id);
  if (!tab) return false;

  const targetPath = await tauriBridge.save({
    title: 'Save CDB As',
    defaultPath: tab.path || tab.name,
    filters: [{ name: 'YGOPro CDB Database', extensions: ['cdb'] }],
  });
  if (!targetPath) return false;

  await activateCdbWorkspaceForLifecycle(id);
  const customSaveResult = await tryRunWorkspaceSaveHandler(id, targetPath);
  if (customSaveResult !== null) {
    return customSaveResult;
  }

  try {
    if (tab.path) {
      await copyWorkspaceMetadataForSaveAs(tab.path, targetPath);
    }
    return saveCdbTabAs(id, targetPath);
  } catch (error) {
    console.error('Failed to save CDB workspace as:', error);
    return false;
  }
}

export async function saveActiveWorkspaceDocument() {
  const activeWorkspace = getActiveWorkspaceDocument();
  if (!activeWorkspace) return false;
  return saveWorkspaceDocument(activeWorkspace.id);
}
