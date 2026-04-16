import { get } from 'svelte/store';
import { _ } from 'svelte-i18n';
import { tauriBridge } from '$lib/infrastructure/tauri';
import { getCardScriptInfo, writeCardScriptDocument } from '$lib/infrastructure/tauri/commands';
import {
  isAbortError,
  normalizeGeneratedScript,
} from '$lib/domain/script/workspace';
import { hasConfiguredSecretKey, loadAppSettings } from '$lib/stores/appSettings.svelte';
import { syncScriptTabFromSavedContent } from '$lib/stores/scriptEditor.svelte';
import type { CardDataEntry } from '$lib/types';
import type { AgentStage } from '$lib/utils/ai';
import { generateCardScript } from '$lib/utils/ai';
import { createAiAppContext } from '$lib/services/aiAppContext';
import { buildTemplateContent } from '$lib/features/script-editor/template';

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
