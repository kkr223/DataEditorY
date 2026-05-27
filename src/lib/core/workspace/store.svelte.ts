import { fromStore, get } from 'svelte/store';
import { _ } from 'svelte-i18n';
import { appShellState } from '$lib/stores/appShell.svelte';
import { activeTabId, tabs, type CdbTab } from '$lib/stores/db';
import {
  activeScriptTabId,
  getScriptTabDisplayName,
  scriptTabs,
} from '$lib/stores/scriptEditor.svelte';
import {
  activeCardImageTabId,
  cardImageTabs,
} from '$lib/stores/cardImageEditor.svelte';
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
const cardImageTabsState = fromStore(cardImageTabs);
const activeCardImageTabIdState = fromStore(activeCardImageTabId);
const workspaceLifecycleVersionState = fromStore(getWorkspaceLifecycleVersionStore());

function getCardImageTitle(tab: { cardCode: number }) {
  return String(get(_)('editor.card_image_tab_title', {
    values: {
      code: tab.cardCode > 0 ? String(tab.cardCode) : 'new',
    },
  } as never));
}

function resolveWorkspaceDocuments() {
  workspaceLifecycleVersionState.current;

  return resolveWorkspaceLifecycleDocuments(buildWorkspaceDocuments({
    dbTabs: tabsState.current,
    scriptTabs: scriptTabsState.current,
    cardImageTabs: cardImageTabsState.current,
    settingsOpen: appShellState.settingsOpen,
    getScriptTitle: getScriptTabDisplayName,
    getCardImageTitle,
  }));
}

function resolveActiveWorkspace() {
  return resolveActiveWorkspaceId({
    mainView: appShellState.mainView,
    settingsOpen: appShellState.settingsOpen,
    activeDbTabId: activeTabIdState.current,
    activeScriptTabId: activeScriptTabIdState.current,
    activeCardImageTabId: activeCardImageTabIdState.current,
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
