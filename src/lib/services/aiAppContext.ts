import { get } from 'svelte/store';
import { readCardScriptDocument } from '$lib/infrastructure/tauri/commands';
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
import { getSelectedCards } from '$lib/stores/cardSelection.svelte';
import { getAllCards } from '$lib/stores/searchResults.svelte';
import type { AiAppContext } from '$lib/features/ai/service';

const DEFAULT_API_BASE_URL = 'https://api.openai.com/v1';

export function createAiAppContext(): AiAppContext {
  return {
    async getAiConfig() {
      await loadAppSettings();
      if (!appSettingsState.values.hasSecretKey) {
        throw new Error('Secret key is not configured');
      }

      return {
        apiBaseUrl: appSettingsState.values.apiBaseUrl || DEFAULT_API_BASE_URL,
        model: appSettingsState.values.model || 'gpt-4o-mini',
        temperature: Number.isFinite(appSettingsState.values.temperature) ? appSettingsState.values.temperature : 1,
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

      const document = await readCardScriptDocument(targetTab.path, code);
      return document.exists
        ? { exists: true, path: document.path, content: document.content }
        : { exists: false, path: document.path, content: null };
    },
  };
}
