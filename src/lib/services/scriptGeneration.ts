import { get } from 'svelte/store';
import { _ } from 'svelte-i18n';
import { tauriBridge } from '$lib/infrastructure/tauri';
import { getCardScriptInfo, writeCardScriptDocument } from '$lib/infrastructure/tauri/commands';
import {
  applyScriptTemplate,
  isAbortError,
  normalizeGeneratedScript,
} from '$lib/domain/script/workspace';
import { appSettingsState, hasConfiguredSecretKey, loadAppSettings } from '$lib/stores/appSettings.svelte';
import { syncScriptTabFromSavedContent } from '$lib/stores/scriptEditor.svelte';
import type { CardDataEntry } from '$lib/types';
import type { AgentStage } from '$lib/utils/ai';
import { generateCardScript } from '$lib/utils/ai';
import { createAiAppContext } from '$lib/services/aiAppContext';

function t(key: string, values?: Record<string, string>) {
  return get(_)(key, values ? { values } : undefined);
}

export async function ensureAiReady() {
  await loadAppSettings();
  if (hasConfiguredSecretKey()) {
    return true;
  }

  await tauriBridge.message(t('editor.ai_requires_secret_key'), {
    title: t('editor.ai_requires_secret_key_title'),
    kind: 'warning',
  });
  return false;
}

export function getScriptGenerationStageLabel(stage: AgentStage | '') {
  switch (stage) {
    case 'collecting_references':
      return t('editor.script_stage_collecting_references');
    case 'requesting_model':
      return t('editor.script_stage_requesting_model');
    case 'running_tools':
      return t('editor.script_stage_running_tools');
    case 'finalizing_response':
      return t('editor.script_stage_finalizing_response');
    default:
      return t('editor.script_generating');
  }
}

export function buildTemplateContent(cardName: string, cardCode: number) {
  return applyScriptTemplate(appSettingsState.values.scriptTemplate, cardName, cardCode);
}

export async function ensureScriptOverwriteConfirmed(cdbPath: string, cardCode: number) {
  const info = await getCardScriptInfo(cdbPath, cardCode);
  if (!info.exists) {
    return true;
  }

  return tauriBridge.ask(t('editor.script_overwrite_confirm', { code: String(cardCode) }), {
    title: t('editor.script_overwrite_title'),
    kind: 'warning',
  });
}

export async function generateCardScriptFile(input: {
  cdbPath: string;
  sourceTabId: string | null;
  card: CardDataEntry;
  signal?: AbortSignal;
  onStageChange?: (stage: AgentStage) => void;
}) {
  const context = createAiAppContext();
  const generatedScript = normalizeGeneratedScript(await generateCardScript(input.card, {
    context,
    signal: input.signal,
    onStageChange: input.onStageChange,
  }));

  const written = await writeCardScriptDocument(
    input.cdbPath,
    Number(input.card.code),
    generatedScript,
    true,
  );

  syncScriptTabFromSavedContent({
    cdbPath: input.cdbPath,
    sourceTabId: input.sourceTabId,
    cardCode: Number(input.card.code),
    cardName: input.card.name ?? '',
    scriptPath: written.path,
    content: generatedScript,
  });

  return {
    path: written.path,
    content: generatedScript,
  };
}

export { isAbortError };
