import type { CdbTab } from '$lib/stores/db';
import type { CardImageWorkspaceState, ScriptWorkspaceState } from '$lib/types';
import type {
  CardImageWorkspaceDocument,
  DbWorkspaceDocument,
  ScriptWorkspaceDocument,
  SettingsWorkspaceDocument,
  WorkspaceDocument,
} from '$lib/core/workspace/types';

export const SETTINGS_WORKSPACE_ID = 'workspace:settings';

export function toDbWorkspaceDocument(tab: CdbTab): DbWorkspaceDocument {
  return {
    id: tab.id,
    kind: 'db',
    title: tab.name,
    subtitle: tab.path,
    dirty: tab.isDirty,
    status: 'ready',
    savePolicy: 'manual',
    closeGuard: 'confirm-dirty',
    source: {
      path: tab.path,
      tabId: tab.id,
    },
    viewState: {
      cachedPage: tab.cachedPage,
      cachedTotal: tab.cachedTotal,
      cachedSelectedId: tab.cachedSelectedId,
    },
    legacy: tab,
  };
}

export function toScriptWorkspaceDocument(
  tab: ScriptWorkspaceState,
  title: string,
): ScriptWorkspaceDocument {
  return {
    id: tab.id,
    kind: 'script',
    title,
    subtitle: tab.cardName || tab.scriptPath,
    dirty: tab.isDirty,
    status: 'ready',
    savePolicy: 'manual',
    closeGuard: 'confirm-dirty',
    source: {
      path: tab.cdbPath,
      tabId: tab.sourceTabId,
    },
    viewState: {
      scriptPath: tab.scriptPath,
      cardCode: tab.cardCode,
      createdFromTemplate: tab.createdFromTemplate,
    },
    legacy: tab,
  };
}

export function toCardImageWorkspaceDocument(
  tab: CardImageWorkspaceState,
  title: string,
): CardImageWorkspaceDocument {
  return {
    id: tab.id,
    kind: 'card-image',
    title,
    subtitle: tab.cardName || tab.cdbPath,
    dirty: false,
    status: 'ready',
    savePolicy: 'none',
    closeGuard: 'none',
    source: {
      path: tab.cdbPath,
      tabId: tab.sourceTabId,
    },
    viewState: {
      cardCode: tab.cardCode,
      cardName: tab.cardName,
    },
    legacy: tab,
  };
}

export function createSettingsWorkspaceDocument(): SettingsWorkspaceDocument {
  return {
    id: SETTINGS_WORKSPACE_ID,
    kind: 'settings',
    title: 'Settings',
    subtitle: 'Application configuration',
    dirty: false,
    status: 'ready',
    savePolicy: 'none',
    closeGuard: 'none',
    source: {
      path: null,
      tabId: null,
    },
    viewState: null,
  };
}

export function buildWorkspaceDocuments(input: {
  dbTabs: CdbTab[];
  scriptTabs: ScriptWorkspaceState[];
  cardImageTabs: CardImageWorkspaceState[];
  settingsOpen: boolean;
  getScriptTitle: (tab: ScriptWorkspaceState) => string;
  getCardImageTitle: (tab: CardImageWorkspaceState) => string;
}): WorkspaceDocument[] {
  const documents: WorkspaceDocument[] = [];

  if (input.settingsOpen) {
    documents.push(createSettingsWorkspaceDocument());
  }

  documents.push(...input.dbTabs.map(toDbWorkspaceDocument));
  documents.push(
    ...input.scriptTabs.map((tab) => toScriptWorkspaceDocument(tab, input.getScriptTitle(tab))),
  );
  documents.push(
    ...input.cardImageTabs.map((tab) => toCardImageWorkspaceDocument(tab, input.getCardImageTitle(tab))),
  );

  return documents;
}

export function resolveActiveWorkspaceId(input: {
  mainView: 'editor' | 'settings' | 'script' | 'card-image';
  settingsOpen: boolean;
  activeDbTabId: string | null;
  activeScriptTabId: string | null;
  activeCardImageTabId: string | null;
}) {
  if (input.mainView === 'settings' && input.settingsOpen) {
    return SETTINGS_WORKSPACE_ID;
  }

  if (input.mainView === 'script') {
    return input.activeScriptTabId;
  }

  if (input.mainView === 'card-image') {
    return input.activeCardImageTabId;
  }

  return input.activeDbTabId;
}
