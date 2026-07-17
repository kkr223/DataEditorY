import { derived, get, writable } from 'svelte/store';
import type { ScriptWorkspaceState } from '$lib/types';
import { activeTabId, tabs } from '$lib/stores/db';
import {
  activateEditorView,
  activateScriptView,
  appShellState,
} from '$lib/stores/appShell.svelte';
import {
  getCardScriptInfo,
} from '$lib/native/scriptApi';
import { readTextFile } from '$lib/native/assetApi';
import {
  buildScriptFileName,
  normalizeScriptContent,
} from '$lib/domain/script/workspace';
import {
  findScriptTabByCard,
  getScriptTabKey,
  isSameCdbPath,
  isScriptTabOwnedByCdb,
} from '$lib/domain/script/tabIdentity';
import { documentRuntime } from '$lib/platform/appRuntime';
import { CARD_COLLECTION_TYPE } from '$lib/modules/card';
import {
  LUA_MEMORY_PROVIDER_ID,
  LUA_SCRIPT_TYPE,
  type LuaScriptDocument,
} from '$lib/modules/lua';

export const scriptTabs = writable<ScriptWorkspaceState[]>([]);
export const activeScriptTabId = writable<string | null>(null);

export const activeScriptTab = derived(
  [scriptTabs, activeScriptTabId],
  ([$tabs, $activeId]) => $tabs.find((tab) => tab.id === $activeId) ?? null,
);

export type OpenScriptTabResult = {
  tabId: string;
  createdFromTemplate: boolean;
};

type ScriptTabContext = Pick<
  ScriptWorkspaceState,
  'cdbPath' | 'sourceTabId' | 'cardCode' | 'cardName'
>;

const inflightOpenRequests = new Map<string, Promise<OpenScriptTabResult>>();

documentRuntime.subscribe((snapshot) => {
  const scriptDocuments = snapshot.documents.filter((document) => (
    document.typeId === LUA_SCRIPT_TYPE
  ));
  scriptTabs.update((currentTabs) => scriptDocuments.map((document) => {
    const current = currentTabs.find((tab) => tab.id === document.id);
    const metadata = document.metadata;
    return {
      id: document.id,
      cdbPath: String(metadata.cdbPath ?? current?.cdbPath ?? ''),
      sourceTabId: typeof metadata.sourceTabId === 'string'
        ? metadata.sourceTabId
        : current?.sourceTabId ?? null,
      cardCode: Number(metadata.cardCode ?? current?.cardCode ?? 0),
      cardName: String(metadata.cardName ?? current?.cardName ?? ''),
      scriptPath: document.source?.path ?? document.source?.uri ?? current?.scriptPath ?? '',
      content: current?.content ?? '',
      savedContent: current?.savedContent ?? '',
      isDirty: document.dirty,
      viewState: current?.viewState ?? null,
      createdFromTemplate: Boolean(
        metadata.createdFromTemplate ?? current?.createdFromTemplate ?? false,
      ),
    };
  }));
});

export const getOpenScriptTab = (
  cdbPath: string,
  cardCode: number,
  sourceTabId?: string | null,
) => {
  return findScriptTabByCard(get(scriptTabs), cdbPath, cardCode, sourceTabId);
};

const buildReferences = (input: ScriptTabContext) => [{
  relation: 'card-script',
  typeId: CARD_COLLECTION_TYPE,
  documentId: input.sourceTabId ?? undefined,
  sourceUri: input.cdbPath,
  metadata: { cardCode: input.cardCode },
}];

const attachScriptMetadata = (
  documentId: string,
  input: ScriptTabContext & { createdFromTemplate: boolean },
) => {
  documentRuntime.patchMetadata(documentId, input);
  documentRuntime.setReferences(documentId, buildReferences(input));
};

const addOrUpdateScriptTab = (input: ScriptWorkspaceState) => {
  scriptTabs.update((currentTabs) => {
    const existing = currentTabs.some((tab) => tab.id === input.id);
    return existing
      ? currentTabs.map((tab) => (tab.id === input.id ? input : tab))
      : [...currentTabs, input];
  });
};

const hydrateScriptTab = async (
  documentId: string,
  input: ScriptTabContext,
  scriptPath: string,
  createdFromTemplate: boolean,
) => {
  attachScriptMetadata(documentId, { ...input, createdFromTemplate });
  const snapshot = await documentRuntime.query<LuaScriptDocument>(documentId, {});
  const content = normalizeScriptContent(snapshot.content);
  const { cdbPath, sourceTabId, cardCode, cardName } = input;
  addOrUpdateScriptTab({
    id: documentId,
    cdbPath,
    sourceTabId,
    cardCode,
    cardName,
    scriptPath,
    content,
    savedContent: content,
    isDirty: false,
    viewState: null,
    createdFromTemplate,
  });
};

export const getActiveScriptTab = () => get(activeScriptTab);

export const hasUnsavedScriptChanges = (
  tabId: string | null = get(activeScriptTabId),
) => {
  if (!tabId) return false;
  return documentRuntime.getDocument(tabId)?.dirty ?? false;
};

export const activateScriptTab = (tabId: string) => {
  const tab = get(scriptTabs).find((item) => item.id === tabId);
  if (!tab) return;

  documentRuntime.activate(tabId);
  activeScriptTabId.set(tabId);
  if (tab.sourceTabId) {
    activeTabId.set(tab.sourceTabId);
  } else {
    const matchedDbTab = get(tabs).find((item) => isSameCdbPath(item.path, tab.cdbPath));
    if (matchedDbTab) activeTabId.set(matchedDbTab.id);
  }
  activateScriptView();
};

export const openOrCreateScriptTab = async (input: ScriptTabContext & {
  templateContent: string;
}): Promise<OpenScriptTabResult> => {
  const key = getScriptTabKey(input.cdbPath, input.cardCode);
  const inflight = inflightOpenRequests.get(key);
  if (inflight) return inflight;

  const existing = getOpenScriptTab(input.cdbPath, input.cardCode, input.sourceTabId);
  if (existing) {
    activateScriptTab(existing.id);
    return { tabId: existing.id, createdFromTemplate: false };
  }

  const promise = (async () => {
    try {
      const info = await getCardScriptInfo(input.cdbPath, input.cardCode);
      const normalizedTemplate = normalizeScriptContent(input.templateContent);
      const document = info.exists
        ? await documentRuntime.openSource({
            uri: info.path,
            path: info.path,
            name: buildScriptFileName(input.cardCode),
          })
        : await documentRuntime.createDocument({
            typeId: LUA_SCRIPT_TYPE,
            providerId: LUA_MEMORY_PROVIDER_ID,
            title: buildScriptFileName(input.cardCode),
            initialData: {
              content: normalizedTemplate,
              language: 'lua',
            } satisfies LuaScriptDocument,
            references: buildReferences(input),
            metadata: {
              ...input,
              createdFromTemplate: true,
            },
          });

      if (!info.exists) {
        await documentRuntime.save(document.id, {
          uri: info.path,
          path: info.path,
          name: buildScriptFileName(input.cardCode),
        });
      }
      await hydrateScriptTab(document.id, input, info.path, !info.exists);
      activeScriptTabId.set(document.id);
      activateScriptView();
      return {
        tabId: document.id,
        createdFromTemplate: !info.exists,
      };
    } finally {
      inflightOpenRequests.delete(key);
    }
  })();

  inflightOpenRequests.set(key, promise);
  return promise;
};

export const openExistingScriptTab = async (input: ScriptTabContext & {
  activate?: boolean;
}): Promise<string | null> => {
  const existing = getOpenScriptTab(input.cdbPath, input.cardCode, input.sourceTabId);
  if (existing) {
    if (input.activate) activateScriptTab(existing.id);
    return existing.id;
  }

  const info = await getCardScriptInfo(input.cdbPath, input.cardCode);
  if (!info.exists) return null;

  const document = await documentRuntime.openSource({
    uri: info.path,
    path: info.path,
    name: buildScriptFileName(input.cardCode),
  });
  await hydrateScriptTab(document.id, input, info.path, false);
  if (input.activate) activateScriptTab(document.id);
  return document.id;
};

export const updateScriptTabContent = (tabId: string, content: string) => {
  const normalized = normalizeScriptContent(content);
  void documentRuntime.execute(tabId, {
    kind: 'replace',
    value: { content: normalized, language: 'lua' },
  });
  scriptTabs.update((currentTabs) => currentTabs.map((tab) => (
    tab.id === tabId
      ? { ...tab, content: normalized, isDirty: normalized !== tab.savedContent }
      : tab
  )));
};

export const setScriptTabViewState = (tabId: string, viewState: unknown | null) => {
  scriptTabs.update((currentTabs) => currentTabs.map((tab) => (
    tab.id === tabId ? { ...tab, viewState } : tab
  )));
};

export const saveScriptTab = async (tabId: string) => {
  const tab = get(scriptTabs).find((item) => item.id === tabId);
  if (!tab) return false;
  await documentRuntime.save(tabId);
  const normalized = normalizeScriptContent(tab.content);
  scriptTabs.update((currentTabs) => currentTabs.map((item) => (
    item.id === tabId
      ? { ...item, content: normalized, savedContent: normalized, isDirty: false }
      : item
  )));
  return true;
};

export const saveActiveScriptTab = async () => {
  const tabId = get(activeScriptTabId);
  return tabId ? saveScriptTab(tabId) : false;
};

export const reloadScriptTab = async (tabId: string) => {
  const tab = get(scriptTabs).find((item) => item.id === tabId);
  if (!tab) return false;
  const content = normalizeScriptContent(await readTextFile(tab.scriptPath));
  await documentRuntime.execute(tabId, {
    kind: 'replace',
    value: { content, language: 'lua' },
  });
  await documentRuntime.save(tabId);
  scriptTabs.update((currentTabs) => currentTabs.map((item) => (
    item.id === tabId
      ? {
          ...item,
          content,
          savedContent: content,
          isDirty: false,
          createdFromTemplate: false,
        }
      : item
  )));
  return true;
};

export const reloadActiveScriptTab = async () => {
  const tabId = get(activeScriptTabId);
  return tabId ? reloadScriptTab(tabId) : false;
};

export const closeScriptTab = async (tabId: string) => {
  const currentTabs = get(scriptTabs);
  const index = currentTabs.findIndex((tab) => tab.id === tabId);
  if (index === -1) return;
  const closedTab = currentTabs[index];
  const cdbIndex = currentTabs
    .filter((tab) => isSameCdbPath(tab.cdbPath, closedTab.cdbPath))
    .findIndex((tab) => tab.id === tabId);
  const wasScriptView = appShellState.mainView === 'script';
  const cdbTab = closedTab.sourceTabId
    ? get(tabs).find((tab) => tab.id === closedTab.sourceTabId)
    : get(tabs).find((tab) => isSameCdbPath(tab.path, closedTab.cdbPath));
  if (get(activeScriptTabId) === tabId && cdbTab) {
    documentRuntime.activate(cdbTab.id);
  }
  await documentRuntime.close(tabId, true);
  const nextTabs = get(scriptTabs);
  if (get(activeScriptTabId) !== tabId) return;
  const nextCdbTabs = nextTabs.filter((tab) => isSameCdbPath(tab.cdbPath, closedTab.cdbPath));
  if (nextCdbTabs.length > 0) {
    const nextTab = nextCdbTabs[Math.min(cdbIndex, nextCdbTabs.length - 1)];
    if (wasScriptView) {
      activateScriptTab(nextTab.id);
    } else {
      activeScriptTabId.set(nextTab.id);
    }
    return;
  }
  activeScriptTabId.set(null);
  if (appShellState.settingsReturnView === 'script') {
    appShellState.settingsReturnView = 'editor';
  }
  if (!wasScriptView) return;
  activateEditorView();
};

export const getScriptTabsForCdb = (cdb: { tabId: string; path: string }) => (
  get(scriptTabs).filter((tab) => isScriptTabOwnedByCdb(tab, cdb))
);

export const closeScriptTabsForCdb = async (cdb: { tabId: string; path: string }) => {
  const ownedTabs = getScriptTabsForCdb(cdb);
  for (const tab of ownedTabs) {
    await closeScriptTab(tab.id);
  }
};

export const getScriptTabDisplayName = (tab: ScriptWorkspaceState) => (
  buildScriptFileName(tab.cardCode)
);
