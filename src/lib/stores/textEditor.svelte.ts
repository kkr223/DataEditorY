import { writable, derived, get } from 'svelte/store';
import { readTextFile, writeTextFile } from '$lib/infrastructure/tauri/commands';
import { tauriBridge } from '$lib/infrastructure/tauri';
import { activateTextView, activateEditorView } from '$lib/stores/appShell.svelte';
import { showToast } from '$lib/stores/toast.svelte';

export type TextTab = {
  id: string;
  path: string;
  name: string;
  content: string;
  savedContent: string;
  isDirty: boolean;
  viewState: unknown | null;
};

export const textTabs = writable<TextTab[]>([]);
export const activeTextTabId = writable<string | null>(null);

export const activeTextTab = derived(
  [textTabs, activeTextTabId],
  ([$tabs, $activeId]) => $tabs.find((tab) => tab.id === $activeId) ?? null,
);

export const getActiveTextTab = () => get(activeTextTab);

function basename(path: string) {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

function resolveLanguageId(path: string): string {
  const ext = path.toLowerCase().split('.').pop() ?? '';
  const map: Record<string, string> = {
    lua: 'lua',
    js: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    ts: 'typescript',
    mts: 'typescript',
    cts: 'typescript',
    json: 'json',
    md: 'markdown',
    markdown: 'markdown',
    rst: 'restructuredtext',
    css: 'css',
    scss: 'scss',
    less: 'less',
    html: 'html',
    htm: 'html',
    xml: 'xml',
    svg: 'xml',
    yaml: 'yaml',
    yml: 'yaml',
    py: 'python',
    rs: 'rust',
    sh: 'shell',
    bash: 'shell',
    zsh: 'shell',
    ini: 'ini',
    cfg: 'ini',
    conf: 'ini',
    sql: 'sql',
    bat: 'bat',
    cmd: 'bat',
    java: 'java',
    go: 'go',
    c: 'cpp',
    h: 'cpp',
    cpp: 'cpp',
    cc: 'cpp',
    cxx: 'cpp',
    hpp: 'cpp',
    dockerfile: 'dockerfile',
    ps1: 'powershell',
    php: 'php',
    rb: 'ruby',
    swift: 'swift',
    kt: 'kotlin',
    kts: 'kotlin',
    cs: 'csharp',
    graphql: 'graphql',
    gql: 'graphql',
  };
  return map[ext] ?? 'plaintext';
}

export function getTextTabLanguage(tab: TextTab) {
  return resolveLanguageId(tab.path);
}

export async function openTextFile(path: string): Promise<string | null> {
  const normalized = path.trim();
  if (!normalized) return null;

  const existing = get(textTabs).find((tab) => tab.path === normalized);
  if (existing) {
    activateTextTab(existing.id);
    return existing.id;
  }

  try {
    const content = await readTextFile(normalized);
    const normalizedContent = content.replaceAll('\r\n', '\n');
    const id = crypto.randomUUID();
    const tab: TextTab = {
      id,
      path: normalized,
      name: basename(normalized),
      content: normalizedContent,
      savedContent: normalizedContent,
      isDirty: false,
      viewState: null,
    };
    textTabs.update((tabs) => [...tabs, tab]);
    activeTextTabId.set(id);
    activateTextView();
    return id;
  } catch (error) {
    console.error('Failed to open text file:', error);
    showToast(`Failed to open ${basename(normalized)}`, 'error');
    return null;
  }
}

export async function openTextFileDialog(): Promise<string | null> {
  const selected = await tauriBridge.open({
    multiple: false,
    directory: false,
  });
  if (!selected) return null;
  const path = typeof selected === 'string' ? selected : (selected as { path?: string }).path;
  if (!path) return null;
  return openTextFile(path);
}

export function activateTextTab(tabId: string) {
  const tab = get(textTabs).find((item) => item.id === tabId);
  if (!tab) return;
  activeTextTabId.set(tabId);
  activateTextView();
}

export function updateTextTabContent(tabId: string, content: string) {
  textTabs.update((tabs) => tabs.map((tab) => {
    if (tab.id !== tabId) return tab;
    if (tab.content === content) return tab;
    return {
      ...tab,
      content,
      isDirty: content !== tab.savedContent,
    };
  }));
}

export function setTextTabViewState(tabId: string, viewState: unknown | null) {
  textTabs.update((tabs) => tabs.map((tab) => (
    tab.id === tabId ? { ...tab, viewState } : tab
  )));
}

export async function saveTextTab(tabId: string, destinationPath?: string): Promise<boolean> {
  const tab = get(textTabs).find((item) => item.id === tabId);
  if (!tab) return false;

  const targetPath = destinationPath ?? tab.path;
  if (!targetPath) return false;

  try {
    await writeTextFile(targetPath, tab.content);
    textTabs.update((tabs) => tabs.map((item) => (
      item.id === tabId
        ? {
            ...item,
            path: targetPath,
            name: basename(targetPath),
            savedContent: item.content,
            isDirty: false,
          }
        : item
    )));
    return true;
  } catch (error) {
    console.error('Failed to save text file:', error);
    showToast(`Failed to save ${tab.name}`, 'error');
    return false;
  }
}

export async function saveTextTabAs(tabId: string): Promise<boolean> {
  const tab = get(textTabs).find((item) => item.id === tabId);
  if (!tab) return false;

  const targetPath = await tauriBridge.save({
    title: 'Save File As',
    defaultPath: tab.path || tab.name,
  });
  if (!targetPath) return false;

  return saveTextTab(tabId, targetPath);
}

export async function closeTextTab(tabId: string): Promise<boolean> {
  const tabs = get(textTabs);
  const index = tabs.findIndex((tab) => tab.id === tabId);
  if (index === -1) return false;

  textTabs.update((list) => list.filter((tab) => tab.id !== tabId));

  const currentActive = get(activeTextTabId);
  if (currentActive === tabId) {
    const remaining = get(textTabs);
    if (remaining.length > 0) {
      activeTextTabId.set(remaining[Math.min(index, remaining.length - 1)]?.id ?? null);
    } else {
      activeTextTabId.set(null);
      activateEditorView();
    }
  }
  return true;
}

export function isTextWorkspace(id: string) {
  return get(textTabs).some((tab) => tab.id === id);
}
