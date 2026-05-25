import { describe, expect, test } from 'bun:test';
import type { CdbTab } from '$lib/stores/db';
import type { CardImageWorkspaceState, ScriptWorkspaceState } from '$lib/types';
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

function createCardImageTab(): CardImageWorkspaceState {
  return {
    id: 'image-1',
    cdbPath: 'D:/cards/main.cdb',
    sourceTabId: 'db-1',
    cardCode: 1000,
    cardName: 'Blue-Eyes',
    card: {
      code: 1000,
      alias: 0,
      ruleCode: 0,
      setcode: [],
      type: 0,
      attack: 0,
      defense: 0,
      level: 0,
      race: 0,
      attribute: 0,
      category: 0,
      ot: 0,
      lscale: 0,
      rscale: 0,
      linkMarker: 0,
      name: 'Blue-Eyes',
      desc: '',
      strings: [],
    },
    snapshot: null,
  };
}

describe('workspace projection helpers', () => {
  test('builds unified workspace documents for db, script, card image, and settings', () => {
    const documents = buildWorkspaceDocuments({
      dbTabs: [createDbTab()],
      scriptTabs: [createScriptTab()],
      cardImageTabs: [createCardImageTab()],
      settingsOpen: true,
      getScriptTitle: () => 'c1000.lua',
      getCardImageTitle: () => 'Image 1000',
    });

    expect(documents.map((document) => document.kind)).toEqual(['settings', 'db', 'script', 'card-image']);
    expect(documents[0]?.id).toBe(SETTINGS_WORKSPACE_ID);
    expect(documents[1]?.dirty).toBe(true);
    expect(documents[2]?.title).toBe('c1000.lua');
    expect(documents[3]?.title).toBe('Image 1000');
  });

  test('resolves the active workspace from shell view state', () => {
    expect(
      resolveActiveWorkspaceId({
        mainView: 'editor',
        settingsOpen: false,
        activeDbTabId: 'db-1',
        activeScriptTabId: 'script-1',
        activeCardImageTabId: 'image-1',
      }),
    ).toBe('db-1');

    expect(
      resolveActiveWorkspaceId({
        mainView: 'script',
        settingsOpen: false,
        activeDbTabId: 'db-1',
        activeScriptTabId: 'script-1',
        activeCardImageTabId: 'image-1',
      }),
    ).toBe('script-1');

    expect(
      resolveActiveWorkspaceId({
        mainView: 'card-image',
        settingsOpen: false,
        activeDbTabId: 'db-1',
        activeScriptTabId: 'script-1',
        activeCardImageTabId: 'image-1',
      }),
    ).toBe('image-1');

    expect(
      resolveActiveWorkspaceId({
        mainView: 'settings',
        settingsOpen: true,
        activeDbTabId: 'db-1',
        activeScriptTabId: 'script-1',
        activeCardImageTabId: 'image-1',
      }),
    ).toBe(SETTINGS_WORKSPACE_ID);
  });
});
