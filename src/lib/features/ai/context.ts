import { appSettingsState, loadAppSettings } from '$lib/stores/appSettings.svelte';
import { getSelectedCards } from '$lib/stores/editor.svelte';
import type { AiAppContext } from '$lib/features/ai/service';
import { tauriBridge } from '$lib/infrastructure/tauri';
import { readTextFile } from '$lib/native/assetApi';
import { getCardScriptInfo } from '$lib/native/scriptApi';
import { loadSecretKey } from '$lib/native/settingsApi';
import { documentRuntime } from '$lib/platform/appRuntime';
import { CARD_COLLECTION_TYPE } from '$lib/modules/card';
import {
  getCardImageDocumentForPath,
} from '$lib/modules/card/workbench/workspaceMetadataState.svelte';
import { getOpenScriptTab } from '$lib/stores/scriptEditor.svelte';
import { getCdbPathIdentity } from '$lib/core/workspace/cdbPathIdentity';

const DEFAULT_API_BASE_URL = 'https://api.openai.com/v1';

export function createAiAppContext(): AiAppContext {
  return {
    async getAiConfig() {
      await loadAppSettings();
      const secretKey = await loadSecretKey();
      if (!secretKey) {
        throw new Error('Secret key is not configured');
      }

      return {
        apiBaseUrl: appSettingsState.values.apiBaseUrl || DEFAULT_API_BASE_URL,
        model: appSettingsState.values.model || 'gpt-4o-mini',
        temperature: Number.isFinite(appSettingsState.values.temperature)
          ? appSettingsState.values.temperature
          : 1,
        maxSteps: appSettingsState.values.agentMaxSteps,
        secretKey,
      };
    },
    listOpenDatabases() {
      const snapshot = documentRuntime.snapshot;
      return snapshot.documents
        .filter((document) => document.typeId === CARD_COLLECTION_TYPE)
        .map((document) => ({
          id: document.id,
          name: document.title,
          path: document.source?.path ?? document.source?.uri ?? '',
          isActive: snapshot.activeDocumentId === document.id,
        }));
    },
    getActiveDatabaseId() {
      const active = documentRuntime.getActiveDocument();
      return active?.typeId === CARD_COLLECTION_TYPE ? active.id : null;
    },
    queryCards(documentId, query) {
      return documentRuntime.query(documentId, query);
    },
    getSelectedCardsInActiveTab() {
      return getSelectedCards();
    },
    async readCardScript(code: number, dbPath?: string) {
      const target = this.listOpenDatabases().find((database) => (
        dbPath
          ? getCdbPathIdentity(database.path) === getCdbPathIdentity(dbPath)
          : database.isActive
      ));
      if (!target) {
        return { exists: false, path: null, content: null };
      }

      const openTab = getOpenScriptTab(target.path, code, target.id);
      if (openTab) {
        return { exists: true, path: openTab.scriptPath, content: openTab.content };
      }

      const info = await getCardScriptInfo(target.path, code);
      if (!info.exists) {
        return { exists: false, path: info.path, content: null };
      }

      const content = await readTextFile(info.path);
      return { exists: true, path: info.path, content };
    },
    async readImageConfig(code: number, dbPath?: string) {
      const target = this.listOpenDatabases().find((database) => (
        dbPath
          ? getCdbPathIdentity(database.path) === getCdbPathIdentity(dbPath)
          : database.isActive
      ));
      return target ? getCardImageDocumentForPath(target.path, code) : null;
    },
    async resolveScriptPath(dbPath: string, fileName: string) {
      const cdbDir = await tauriBridge.dirname(dbPath);
      const scriptDir = await tauriBridge.join(cdbDir, 'script');
      return tauriBridge.join(scriptDir, fileName);
    },
    async resolveScriptTestPath(dbPath: string, code: number) {
      const cdbDir = await tauriBridge.dirname(dbPath);
      return tauriBridge.join(cdbDir, '.dey', 'ai-tests', `c${code}.test-plan.json`);
    },
  };
}
