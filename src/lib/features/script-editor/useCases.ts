import type { CardDataEntry, ScriptWorkspaceState } from '$lib/types';
import type { AgentStage } from '$lib/utils/ai';
import { tauriBridge } from '$lib/infrastructure/tauri';
import { getCardByIdInTab, modifyCardsInTab } from '$lib/stores/db';
import { reloadActiveScriptTab, saveActiveScriptTab } from '$lib/stores/scriptEditor.svelte';
import { showToast } from '$lib/stores/toast.svelte';
import { updateVisibleCards } from '$lib/stores/editor.svelte';
import { writeErrorLog } from '$lib/utils/errorLog';
import { normalizeCardStrings } from '$lib/domain/card/draft';
import {
  ensureAiReady,
  ensureScriptOverwriteConfirmed,
  generateCardScriptFile,
  isAbortError,
} from '$lib/services/scriptGeneration';
import { openScriptExternally } from '$lib/services/cardScriptService';
import { normalizeScriptCardContext } from '$lib/features/script-editor/controller';

type Translate = (key: string, options?: Record<string, unknown>) => string;

export async function loadScriptCardContextFlow(input: {
  tab: ScriptWorkspaceState | null;
  dbTabs: Array<{ id: string; path: string }>;
  loadToken: number;
}) {
  if (!input.tab) {
    return {
      loadToken: input.loadToken,
      cardContext: null,
      savedScriptStrings: Array.from({ length: 16 }, () => ''),
    };
  }

  const sourceTabId = input.tab.sourceTabId || input.dbTabs.find((item) => item.path === input.tab?.cdbPath)?.id || null;
  if (!sourceTabId) {
    return {
      loadToken: input.loadToken,
      cardContext: null,
      savedScriptStrings: Array.from({ length: 16 }, () => ''),
    };
  }

  try {
    const card = await getCardByIdInTab(sourceTabId, input.tab.cardCode);
    return {
      loadToken: input.loadToken,
      cardContext: normalizeScriptCardContext(card),
      savedScriptStrings: normalizeCardStrings(card?.strings),
    };
  } catch {
    return {
      loadToken: input.loadToken,
      cardContext: null,
      savedScriptStrings: Array.from({ length: 16 }, () => ''),
    };
  }
}

export async function saveScriptStringFlow(input: {
  tab: ScriptWorkspaceState | null;
  cardContext: CardDataEntry | null;
  savedScriptStrings: string[];
  index: number;
  dbTabs: Array<{ id: string; path: string }>;
  activeDbTabId: string | null;
  t: Translate;
}) {
  if (!input.tab || !input.cardContext) {
    return null;
  }

  const nextValue = input.cardContext.strings[input.index] ?? '';
  if (nextValue === (input.savedScriptStrings[input.index] ?? '')) {
    return {
      cardContext: input.cardContext,
      savedScriptStrings: input.savedScriptStrings,
    };
  }

  const sourceTabId = input.tab.sourceTabId || input.dbTabs.find((item) => item.path === input.tab?.cdbPath)?.id || null;
  if (!sourceTabId) {
    showToast(input.t('editor.save_failed'), 'error');
    return null;
  }

  const nextCard: CardDataEntry = {
    ...input.cardContext,
    strings: normalizeCardStrings(input.cardContext.strings),
    setcode: Array.isArray(input.cardContext.setcode) ? [...input.cardContext.setcode] : [],
  };

  const ok = await modifyCardsInTab(sourceTabId, [nextCard]);
  if (!ok) {
    showToast(input.t('editor.save_failed'), 'error');
    return null;
  }

  if (input.activeDbTabId === sourceTabId) {
    updateVisibleCards([nextCard]);
  }

  return {
    cardContext: nextCard,
    savedScriptStrings: normalizeCardStrings(nextCard.strings),
  };
}

export async function saveScriptEditorFlow(input: {
  tab: ScriptWorkspaceState | null;
  isSaving: boolean;
  t: Translate;
}) {
  if (!input.tab || input.isSaving) {
    return false;
  }

  try {
    const ok = await saveActiveScriptTab();
    showToast(input.t(ok ? 'editor.script_save_success' : 'editor.script_save_failed'), ok ? 'success' : 'error');
    return ok;
  } catch (error) {
    console.error('Failed to save script', error);
    void writeErrorLog({
      source: 'script.save',
      error,
      extra: {
        path: input.tab.scriptPath,
        cardCode: input.tab.cardCode,
      },
    });
    showToast(input.t('editor.script_save_failed'), 'error');
    return false;
  }
}

export async function generateScriptFromEditorFlow(input: {
  tab: ScriptWorkspaceState | null;
  isGeneratingScript: boolean;
  cardContext: CardDataEntry | null;
  dbTabs: Array<{ id: string; path: string }>;
  t: Translate;
  setIsGeneratingScript: (value: boolean) => void;
  setScriptGenerationStage: (value: AgentStage | '') => void;
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

export async function reloadScriptEditorFlow(input: {
  tab: ScriptWorkspaceState | null;
  isReloading: boolean;
  t: Translate;
}) {
  const tab = input.tab;
  if (!tab || input.isReloading) {
    return false;
  }

  if (tab.isDirty) {
    const confirmed = await tauriBridge.ask(input.t('editor.script_reload_confirm'), {
      title: input.t('editor.script_reload_title'),
      kind: 'warning',
    });
    if (!confirmed) {
      return false;
    }
  }

  try {
    const ok = await reloadActiveScriptTab();
    if (ok) {
      showToast(input.t('editor.script_reload_success'), 'success');
    }
    return ok;
  } catch (error) {
    console.error('Failed to reload script', error);
    void writeErrorLog({
      source: 'script.reload',
      error,
      extra: {
        path: tab.scriptPath,
        cardCode: tab.cardCode,
      },
    });
    showToast(input.t('editor.script_reload_failed'), 'error');
    return false;
  }
}

export async function openScriptExternallyFlow(input: {
  tab: ScriptWorkspaceState | null;
  t: Translate;
}) {
  const tab = input.tab;
  if (!tab) {
    return false;
  }

  try {
    await openScriptExternally(tab.scriptPath);
    return true;
  } catch (error) {
    console.error('Failed to open script externally', error);
    void writeErrorLog({
      source: 'script.open-external',
      error,
      extra: {
        path: tab.scriptPath,
        cardCode: tab.cardCode,
      },
    });
    showToast(input.t('editor.script_open_failed'), 'error');
    return false;
  }
}
