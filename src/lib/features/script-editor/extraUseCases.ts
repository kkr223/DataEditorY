import type { CardDataEntry, ScriptWorkspaceState } from '$lib/types';
import type { ScriptGenerationStage } from '$lib/services/scriptGenerationStages';
import { getCardByIdInTab } from '$lib/stores/db';
import { showToast } from '$lib/stores/toast.svelte';
import { writeErrorLog } from '$lib/utils/errorLog';
import {
  ensureAiReady,
  ensureScriptOverwriteConfirmed,
  generateCardScriptFile,
  isAbortError,
} from '$lib/services/scriptGeneration';
import { normalizeScriptCardContext } from '$lib/features/script-editor/controller';

type Translate = (key: string, options?: Record<string, unknown>) => string;

export async function generateScriptFromEditorFlow(input: {
  tab: ScriptWorkspaceState | null;
  isGeneratingScript: boolean;
  cardContext: CardDataEntry | null;
  dbTabs: Array<{ id: string; path: string }>;
  t: Translate;
  setIsGeneratingScript: (value: boolean) => void;
  setScriptGenerationStage: (value: ScriptGenerationStage | '') => void;
  setAbortController: (value: AbortController | null) => void;
}) {
  const tab = input.tab;
  if (!tab || input.isGeneratingScript) {
    return false;
  }

  if (!(await ensureAiReady())) {
    return false;
  }

  try {
    const shouldOverwrite = await ensureScriptOverwriteConfirmed(tab.cdbPath, tab.cardCode);
    if (!shouldOverwrite) {
      return false;
    }

    const sourceTabId = tab.sourceTabId || input.dbTabs.find((item) => item.path === tab.cdbPath)?.id || null;
    const latestCard = sourceTabId
      ? normalizeScriptCardContext(await getCardByIdInTab(sourceTabId, tab.cardCode))
      : normalizeScriptCardContext(input.cardContext);
    const targetCard = latestCard ?? normalizeScriptCardContext(input.cardContext);

    if (!targetCard) {
      showToast(input.t('editor.script_generate_failed'), 'error');
      return false;
    }

    input.setIsGeneratingScript(true);
    input.setScriptGenerationStage('collecting_references');
    const abortController = new AbortController();
    input.setAbortController(abortController);

    await generateCardScriptFile({
      cdbPath: tab.cdbPath,
      sourceTabId,
      card: {
        ...targetCard,
        name: targetCard.name ?? tab.cardName,
      },
      signal: abortController.signal,
      onStageChange: (stage) => {
        input.setScriptGenerationStage(stage);
      },
    });
    showToast(input.t('editor.script_generated', { values: { code: String(tab.cardCode) } }), 'success');
    return true;
  } catch (error) {
    if (isAbortError(error)) {
      showToast(input.t('editor.script_generation_canceled'), 'info');
      return false;
    }

    console.error('Failed to generate script', error);
    void writeErrorLog({
      source: 'script.generate',
      error,
      extra: {
        cdbPath: tab.cdbPath,
        cardCode: tab.cardCode,
        cardName: tab.cardName,
      },
    });
    showToast(input.t('editor.script_generate_failed'), 'error');
    return false;
  } finally {
    input.setIsGeneratingScript(false);
    input.setScriptGenerationStage('');
    input.setAbortController(null);
  }
}
