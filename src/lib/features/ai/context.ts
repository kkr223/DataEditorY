import { appSettingsState, loadAppSettings } from '$lib/stores/appSettings.svelte';
import {
  activeTab,
  deleteCardsWithSnapshotInTab,
  getCardByIdInTab,
  getCardsByIdsInTab,
  modifyCardsWithSnapshotInTab,
  queryCardsRaw,
  tabs,
} from '$lib/stores/db';
import { getAllCards, getSelectedCards } from '$lib/stores/editor.svelte';
import type { AiAppContext } from '$lib/utils/ai';
import { get } from 'svelte/store';
import { invokeCommand } from '$lib/infrastructure/tauri';
import { getCardScriptInfo } from '$lib/infrastructure/tauri/commands';

const DEFAULT_API_BASE_URL = 'https://api.openai.com/v1';

export function createAiAppContext(): AiAppContext {
  return {
    async getAiConfig() {
      await loadAppSettings();
      const secretKey = await invokeCommand<string | null>('load_secret_key');
      if (!secretKey) {
        throw new Error('Secret key is not configured');
      }

      return {
        apiBaseUrl: appSettingsState.values.apiBaseUrl || DEFAULT_API_BASE_URL,
        model: appSettingsState.values.model || 'gpt-4o-mini',
        temperature: Number.isFinite(appSettingsState.values.temperature) ? appSettingsState.values.temperature : 1,
        secretKey,
      };
    },
    listOpenDatabases() {
      const currentActiveTab = get(activeTab);
      return get(tabs).map((tab) => ({
        id: tab.id,
        name: tab.name,
        path: tab.path,
        isActive: currentActiveTab?.id === tab.id,
      }));
    },
    getActiveDatabaseId() {
      return get(activeTab)?.id ?? null;
    },
    getCardByIdInTab,
    getCardsByIdsInTab,
    queryCardsRaw,
    getSelectedCardsInActiveTab() {
      return getSelectedCards();
    },
    getVisibleCardsInActiveTab() {
      return getAllCards();
    },
    modifyCardsWithSnapshotInTab,
    deleteCardsWithSnapshotInTab,
    async readCardScript(code: number, dbPath?: string) {
      const targetTab = dbPath
        ? get(tabs).find((tab) => tab.path === dbPath)
        : get(activeTab);

      if (!targetTab) {
        return { exists: false, path: null, content: null };
      }

      const info = await getCardScriptInfo(targetTab.path, code);
      if (!info.exists) {
        return { exists: false, path: info.path, content: null };
      }

      const content = await invokeCommand<string>('read_text_file', { path: info.path });
      return { exists: true, path: info.path, content };
    },
  };
}
