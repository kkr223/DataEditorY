import { buildScriptFileName, normalizeScriptContent } from '$lib/domain/script/workspace';
import {
  getCardScriptInfo,
  openInDefaultApp,
  openInSystemEditor,
  readCardScriptDocument,
  saveCardScriptDocument,
} from '$lib/infrastructure/tauri/commands';
import { openOrCreateScriptTab } from '$lib/stores/scriptEditor.svelte';
import { buildTemplateContent } from '$lib/services/scriptTemplate';

export async function getExistingCardScriptInfo(cdbPath: string, cardCode: number) {
  return getCardScriptInfo(cdbPath, cardCode);
}

export async function openCardScriptWorkspace(input: {
  cdbPath: string;
  sourceTabId: string | null;
  cardCode: number;
  cardName: string;
}) {
  return openOrCreateScriptTab({
    cdbPath: input.cdbPath,
    sourceTabId: input.sourceTabId,
    cardCode: input.cardCode,
    cardName: input.cardName,
    templateContent: buildTemplateContent(input.cardName, input.cardCode),
  });
}

export async function ensureCardScriptFile(input: {
  cdbPath: string;
  cardCode: number;
  cardName: string;
}) {
  const loaded = await readCardScriptDocument(input.cdbPath, input.cardCode);
  if (loaded.exists) {
    return {
      path: loaded.path,
      createdFromTemplate: false,
    };
  }

  const content = buildTemplateContent(input.cardName, input.cardCode);
  const saved = await saveCardScriptDocument(input.cdbPath, input.cardCode, content);
  return {
    path: saved.path,
    createdFromTemplate: true,
  };
}

export async function openScriptExternally(path: string) {
  return openInSystemEditor(path);
}

export async function openScriptWithDefaultApp(path: string) {
  return openInDefaultApp(path);
}

export async function readCardScript(cdbPath: string, cardCode: number) {
  return readCardScriptDocument(cdbPath, cardCode);
}

export async function saveCardScript(cdbPath: string, cardCode: number, content: string) {
  return saveCardScriptDocument(cdbPath, cardCode, normalizeScriptContent(content));
}

export { buildScriptFileName, normalizeScriptContent };
