import { describe, expect, test } from 'bun:test';
import type { CdbTab } from '$lib/stores/db';
import type { DocumentRecord } from '$lib/platform';
import type { ScriptWorkspaceState } from '$lib/types';
import { CARD_IMAGE_CONFIG_TYPE } from '$lib/modules/card-image/constants';
import {
  SETTINGS_WORKSPACE_ID,
  buildWorkspaceDocuments,
  resolveActiveWorkspaceId,
} from '$lib/core/workspace/projection';

function createDbTab(): CdbTab {
  return {
    id: 'db-1',
    path: 'D:/cards/main.cdb',
    name: 'main.cdb',
    cachedCards: [],
    cachedTotal: 0,
    cachedPage: 1,
    cachedFilters: '{}',
    cachedSelectedIds: [],
    cachedSelectedId: null,
    cachedSelectionAnchorId: null,
    isDirty: true,
  };
}

function createScriptTab(): ScriptWorkspaceState {
  return {
    id: 'script-1',
    cdbPath: 'D:/cards/main.cdb',
    sourceTabId: 'db-1',
    cardCode: 1000,
    cardName: 'Blue-Eyes',
    scriptPath: 'D:/cards/script/c1000.lua',
    content: 'print(1)',
    savedContent: 'print(1)',
    isDirty: false,
    viewState: null,
    createdFromTemplate: false,
  };
}

function createCardImageDocument(): DocumentRecord {
  return {
    id: 'card-image-1',
    typeId: CARD_IMAGE_CONFIG_TYPE,
    schemaVersion: 1,
    title: '1000-card-image.json',
    source: null,
    codecId: null,
    providerId: 'card-image.memory-provider',
    savePolicy: 'manual',
    dirty: true,
    revision: 1,
    savedRevision: -1,
    references: [],
    metadata: {
      cardCode: 1000,
    },
  };
}

describe('workspace projection helpers', () => {
  test('builds unified workspace documents for db, script, card image, and settings', () => {
    const documents = buildWorkspaceDocuments({
      dbTabs: [createDbTab()],
      scriptTabs: [createScriptTab()],
      cardImageDocuments: [createCardImageDocument()],
      settingsOpen: true,
      getScriptTitle: () => 'c1000.lua',
    });

    expect(documents.map((document) => document.kind)).toEqual(['settings', 'db', 'script', 'card-image']);
    expect(documents[0]?.id).toBe(SETTINGS_WORKSPACE_ID);
    expect(documents[1]?.dirty).toBe(true);
    expect(documents[2]?.title).toBe('c1000.lua');
    expect(documents[3]?.dirty).toBe(true);
  });

  test('resolves the active workspace from shell view state', () => {
    expect(
      resolveActiveWorkspaceId({
        mainView: 'editor',
        settingsOpen: false,
        activeDbTabId: 'db-1',
        activeScriptTabId: 'script-1',
      }),
    ).toBe('db-1');

    expect(
      resolveActiveWorkspaceId({
        mainView: 'script',
        settingsOpen: false,
        activeDbTabId: 'db-1',
        activeScriptTabId: 'script-1',
      }),
    ).toBe('script-1');

    expect(
      resolveActiveWorkspaceId({
        mainView: 'settings',
        settingsOpen: true,
        activeDbTabId: 'db-1',
        activeScriptTabId: 'script-1',
      }),
    ).toBe(SETTINGS_WORKSPACE_ID);

    expect(
      resolveActiveWorkspaceId({
        mainView: 'editor',
        settingsOpen: false,
        activeDbTabId: 'db-1',
        activeScriptTabId: 'script-1',
        activeDocumentId: 'card-image-1',
        cardImageDocuments: [createCardImageDocument()],
      }),
    ).toBe('card-image-1');
  });
});
