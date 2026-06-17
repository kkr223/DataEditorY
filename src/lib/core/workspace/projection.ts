import type { CdbTab } from '$lib/stores/db';
import type { DocumentRecord } from '$lib/platform';
import type { ScriptWorkspaceState } from '$lib/types';
import { CARD_IMAGE_CONFIG_TYPE } from '$lib/modules/card-image/constants';
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

export function toCardImageWorkspaceDocument(document: DocumentRecord): CardImageWorkspaceDocument {
  const cardCode = Number(document.metadata.cardCode ?? 0);
  const subtitle = document.source?.path
    ?? document.source?.uri
    ?? (cardCode > 0 ? `Card ${cardCode}` : 'Card image configuration');

  return {
    id: document.id,
    kind: 'card-image',
    title: document.title,
    subtitle,
    dirty: document.dirty,
    status: 'ready',
    savePolicy: 'manual',
    closeGuard: 'confirm-dirty',
    source: {
      path: document.source?.path ?? document.source?.uri ?? null,
      tabId: document.id,
    },
    viewState: {
      typeId: document.typeId,
      cardCode: cardCode > 0 ? cardCode : null,
    },
  };
}

export function buildWorkspaceDocuments(input: {
  dbTabs: CdbTab[];
  scriptTabs: ScriptWorkspaceState[];
  cardImageDocuments?: DocumentRecord[];
  settingsOpen: boolean;
  getScriptTitle: (tab: ScriptWorkspaceState) => string;
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
    ...(input.cardImageDocuments ?? [])
      .filter((document) => document.typeId === CARD_IMAGE_CONFIG_TYPE)
      .map(toCardImageWorkspaceDocument),
  );

  return documents;
}

export function resolveActiveWorkspaceId(input: {
  mainView: 'editor' | 'settings' | 'script';
  settingsOpen: boolean;
  activeDbTabId: string | null;
  activeScriptTabId: string | null;
  activeDocumentId?: string | null;
  cardImageDocuments?: DocumentRecord[];
}) {
  if (input.mainView === 'settings' && input.settingsOpen) {
    return SETTINGS_WORKSPACE_ID;
  }

  if (input.mainView === 'script') {
    return input.activeScriptTabId;
  }

  if (
    input.activeDocumentId
    && (input.cardImageDocuments ?? []).some((document) => document.id === input.activeDocumentId)
  ) {
    return input.activeDocumentId;
  }

  return input.activeDbTabId;
}
