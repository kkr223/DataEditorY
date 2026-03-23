import { get, derived, writable } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';
import type { ScriptTabState } from '$lib/types';
import { activeTabId, tabs } from '$lib/stores/db';
import { activateEditorView, activateScriptView } from '$lib/stores/appShell.svelte';

type CardScriptDocument = {
  path: string;
  exists: boolean;
  content: string;
};

type CardScriptInfo = {
  path: string;
  exists: boolean;
};

export const scriptTabs = writable<ScriptTabState[]>([]);
export const activeScriptTabId = writable<string | null>(null);

export const activeScriptTab = derived(
  [scriptTabs, activeScriptTabId],
  ([$tabs, $activeId]) => $tabs.find((tab) => tab.id === $activeId) ?? null,
);

export type OpenScriptTabResult = {
  tabId: string;
  createdFromTemplate: boolean;
};

function normalizeScriptContent(content: string) {
  return content.replace(/\r\n/g, '\n');
}

function buildScriptTabName(cardCode: number) {
  return `c${cardCode}.lua`;
}

function getScriptKey(cdbPath: string, cardCode: number) {
  return `${cdbPath}::${cardCode}`;
}

function getScriptTabByKey(cdbPath: string, cardCode: number) {
  const key = getScriptKey(cdbPath, cardCode);
  return get(scriptTabs).find((tab) => getScriptKey(tab.cdbPath, tab.cardCode) === key) ?? null;
}

async function readScriptDocument(cdbPath: string, cardCode: number) {
  return invoke<CardScriptDocument>('read_card_script', {
    cdbPath,
    cardId: cardCode,
  });
}

export function getActiveScriptTab() {
  return get(activeScriptTab);
}

export function hasUnsavedScriptChanges(tabId: string | null = get(activeScriptTabId)) {
  if (!tabId) return false;
  return get(scriptTabs).find((tab) => tab.id === tabId)?.isDirty ?? false;
}

export function activateScriptTab(tabId: string) {
  const tab = get(scriptTabs).find((item) => item.id === tabId);
  if (!tab) return;

  activeScriptTabId.set(tabId);
  if (tab.sourceTabId) {
    activeTabId.set(tab.sourceTabId);
  } else {
    const matchedDbTab = get(tabs).find((item) => item.path === tab.cdbPath);
    if (matchedDbTab) {
      activeTabId.set(matchedDbTab.id);
    }
  }
  activateScriptView();
}

export function syncScriptTabFromSavedContent(input: {
  cdbPath: string;
  sourceTabId: string | null;
  cardCode: number;
  cardName: string;
  scriptPath: string;
  content: string;
}) {
  const existing = getScriptTabByKey(input.cdbPath, input.cardCode);
  const normalized = normalizeScriptContent(input.content);

  if (existing) {
    scriptTabs.update((currentTabs) =>
      currentTabs.map((tab) =>
        tab.id === existing.id
          ? {
              ...tab,
              sourceTabId: input.sourceTabId,
              cardName: input.cardName,
              scriptPath: input.scriptPath,
              content: normalized,
              savedContent: normalized,
              isDirty: false,
              createdFromTemplate: false,
            }
          : tab,
      ),
    );
    activateScriptTab(existing.id);
    return existing.id;
  }

  const nextTab: ScriptTabState = {
    id: crypto.randomUUID(),
    cdbPath: input.cdbPath,
    sourceTabId: input.sourceTabId,
    cardCode: input.cardCode,
    cardName: input.cardName,
    scriptPath: input.scriptPath,
    content: normalized,
    savedContent: normalized,
    isDirty: false,
    viewState: null,
    createdFromTemplate: false,
  };

  scriptTabs.update((currentTabs) => [...currentTabs, nextTab]);
  activeScriptTabId.set(nextTab.id);
  activateScriptView();
  return nextTab.id;
}

export async function openOrCreateScriptTab(input: {
  cdbPath: string;
  sourceTabId: string | null;
  cardCode: number;
  cardName: string;
  templateContent: string;
}): Promise<OpenScriptTabResult> {
  const existing = getScriptTabByKey(input.cdbPath, input.cardCode);
  if (existing) {
    activateScriptTab(existing.id);
    return {
      tabId: existing.id,
      createdFromTemplate: false,
    };
  }

  const loaded = await readScriptDocument(input.cdbPath, input.cardCode);
  let content = normalizeScriptContent(loaded.content);
  let savedContent = content;
  let createdFromTemplate = false;

  if (!loaded.exists) {
    content = normalizeScriptContent(input.templateContent);
    const saved = await invoke<CardScriptInfo>('save_card_script', {
      cdbPath: input.cdbPath,
      cardId: input.cardCode,
      content,
    });
    savedContent = content;
    createdFromTemplate = true;

    const nextTab: ScriptTabState = {
      id: crypto.randomUUID(),
      cdbPath: input.cdbPath,
      sourceTabId: input.sourceTabId,
      cardCode: input.cardCode,
      cardName: input.cardName,
      scriptPath: saved.path,
      content,
      savedContent,
      isDirty: false,
      viewState: null,
      createdFromTemplate,
    };

    scriptTabs.update((currentTabs) => [...currentTabs, nextTab]);
    activeScriptTabId.set(nextTab.id);
    activateScriptView();
    return {
      tabId: nextTab.id,
      createdFromTemplate: true,
    };
  }

  const nextTab: ScriptTabState = {
    id: crypto.randomUUID(),
    cdbPath: input.cdbPath,
    sourceTabId: input.sourceTabId,
    cardCode: input.cardCode,
    cardName: input.cardName,
    scriptPath: loaded.path,
    content,
    savedContent,
    isDirty: false,
    viewState: null,
    createdFromTemplate,
  };

  scriptTabs.update((currentTabs) => [...currentTabs, nextTab]);
  activeScriptTabId.set(nextTab.id);
  activateScriptView();
  return {
    tabId: nextTab.id,
    createdFromTemplate: false,
  };
}

export function updateScriptTabContent(tabId: string, content: string) {
  const normalized = normalizeScriptContent(content);
  scriptTabs.update((currentTabs) =>
    currentTabs.map((tab) =>
      tab.id === tabId
        ? {
            ...tab,
            content: normalized,
            isDirty: normalized !== tab.savedContent,
          }
        : tab,
    ),
  );
}

export function setScriptTabViewState(tabId: string, viewState: unknown | null) {
  scriptTabs.update((currentTabs) =>
    currentTabs.map((tab) => (tab.id === tabId ? { ...tab, viewState } : tab)),
  );
}

export async function saveScriptTab(tabId: string) {
  const tab = get(scriptTabs).find((item) => item.id === tabId);
  if (!tab) return false;

  const normalized = normalizeScriptContent(tab.content);
  const saved = await invoke<CardScriptInfo>('save_card_script', {
    cdbPath: tab.cdbPath,
    cardId: tab.cardCode,
    content: normalized,
  });

  scriptTabs.update((currentTabs) =>
    currentTabs.map((item) =>
      item.id === tabId
        ? {
            ...item,
            scriptPath: saved.path,
            content: normalized,
            savedContent: normalized,
            isDirty: false,
          }
        : item,
    ),
  );
  return true;
}

export async function saveActiveScriptTab() {
  const tabId = get(activeScriptTabId);
  if (!tabId) return false;
  return saveScriptTab(tabId);
}

export async function reloadScriptTab(tabId: string) {
  const tab = get(scriptTabs).find((item) => item.id === tabId);
  if (!tab) return false;

  const loaded = await readScriptDocument(tab.cdbPath, tab.cardCode);
  const normalized = normalizeScriptContent(loaded.content);
  scriptTabs.update((currentTabs) =>
    currentTabs.map((item) =>
      item.id === tabId
        ? {
            ...item,
            scriptPath: loaded.path,
            content: normalized,
            savedContent: normalized,
            isDirty: false,
            createdFromTemplate: false,
          }
        : item,
    ),
  );
  return true;
}

export async function reloadActiveScriptTab() {
  const tabId = get(activeScriptTabId);
  if (!tabId) return false;
  return reloadScriptTab(tabId);
}

export function closeScriptTab(tabId: string) {
  const currentTabs = get(scriptTabs);
  const index = currentTabs.findIndex((tab) => tab.id === tabId);
  if (index === -1) return;

  const nextTabs = currentTabs.filter((tab) => tab.id !== tabId);
  scriptTabs.set(nextTabs);

  if (get(activeScriptTabId) === tabId) {
    if (nextTabs.length > 0) {
      const nextIndex = Math.min(index, nextTabs.length - 1);
      const nextTab = nextTabs[nextIndex];
      activeScriptTabId.set(nextTab.id);
      activateScriptView();
      if (nextTab.sourceTabId) {
        activeTabId.set(nextTab.sourceTabId);
      }
    } else {
      activeScriptTabId.set(null);
      activateEditorView();
    }
  }
}

export function getScriptTabDisplayName(tab: ScriptTabState) {
  return buildScriptTabName(tab.cardCode);
}
