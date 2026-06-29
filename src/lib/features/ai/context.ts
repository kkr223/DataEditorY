import { appSettingsState, loadAppSettings } from '$lib/stores/appSettings.svelte';
import { getSelectedCards } from '$lib/stores/editor.svelte';
import type { AiAppContext } from '$lib/features/ai/service';
import { invokeCommand, tauriBridge } from '$lib/infrastructure/tauri';
import { getCardScriptInfo } from '$lib/infrastructure/tauri/commands';
import { documentRuntime } from '$lib/platform/appRuntime';
import { CARD_COLLECTION_TYPE } from '$lib/modules/card';
import { getCardImageDocument } from '$lib/modules/card/workbench/workspaceMetadataState.svelte';

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
        temperature: Number.isFinite(appSettingsState.values.temperature)
          ? appSettingsState.values.temperature
          : 1,
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
        dbPath ? database.path === dbPath : database.isActive
      ));
      if (!target) {
        return { exists: false, path: null, content: null };
      }

      const info = await getCardScriptInfo(target.path, code);
      if (!info.exists) {
        return { exists: false, path: info.path, content: null };
      }

      const content = await invokeCommand<string>('read_text_file', { path: info.path });
      return { exists: true, path: info.path, content };
    },
    readImageConfig(code: number) {
      return getCardImageDocument(code);
    },
    async resolveScriptPath(dbPath: string, fileName: string) {
      await loadAppSettings();
      if (appSettingsState.values.scriptDirectory.trim()) {
        return tauriBridge.join(appSettingsState.values.scriptDirectory.trim(), fileName);
      }
      const cdbDir = await tauriBridge.dirname(dbPath);
      const scriptDir = await tauriBridge.join(cdbDir, 'script');
      return tauriBridge.join(scriptDir, fileName);
    },
    async resolveScriptTestPath(dbPath: string, code: number) {
      const cdbDir = await tauriBridge.dirname(dbPath);
      return tauriBridge.join(cdbDir, '.dey', 'ai-tests', `c${code}.test-plan.json`);
    },
    async getYgoproPath() {
      await loadAppSettings();
      return appSettingsState.values.ygoproPath.trim();
    },
  };
}
