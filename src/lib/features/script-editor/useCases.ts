import type { CardDataEntry, ScriptWorkspaceState } from '$lib/types';
import { tauriBridge } from '$lib/infrastructure/tauri';
import { getCardByIdInTab, modifyCardsInTab } from '$lib/stores/db';
import { reloadActiveScriptTab, saveActiveScriptTab } from '$lib/stores/scriptEditor.svelte';
import { showToast } from '$lib/stores/toast.svelte';
import { updateVisibleCards } from '$lib/stores/editor.svelte';
import { writeErrorLog } from '$lib/utils/errorLog';
import { normalizeCardStrings } from '$lib/domain/card/draft';
import { buildScriptImagePath } from '$lib/domain/script/workspace';
import { appSettingsState } from '$lib/stores/appSettings.svelte';
import { openScriptExternally } from '$lib/services/cardScriptService';
import { writeBinaryFile } from '$lib/infrastructure/tauri/commands';
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

async function blobToUint8Array(blob: Blob) {
  return Array.from(new Uint8Array(await blob.arrayBuffer()));
}

async function writeImageBlobToClipboard(blob: Blob) {
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
    throw new Error('Image clipboard API is not available');
  }

  await navigator.clipboard.write([
    new ClipboardItem({
      'image/png': blob,
    }),
  ]);
}

export type ScriptImageRenderInfo = {
  title: string;
  metaLines: string[];
  effectTitle: string;
  effectText: string;
};

export type ScriptImageSelection = {
  content: string;
  startLineNumber: number;
};

async function buildScriptImageBlob(input: {
  content: string;
  lineNumberStart?: number;
  renderInfo: ScriptImageRenderInfo;
}) {
  const imageRenderer = await import('$lib/utils/luaScriptImageRenderer');
  return imageRenderer.renderLuaCodeImageBlob(input.content, {
    title: input.renderInfo.title,
    metaLines: input.renderInfo.metaLines,
    effectTitle: input.renderInfo.effectTitle,
    effectText: input.renderInfo.effectText,
    lineNumberStart: input.lineNumberStart,
  });
}

export async function shareScriptImageFlow(input: {
  tab: ScriptWorkspaceState | null;
  isSharing: boolean;
  renderInfo: ScriptImageRenderInfo;
  selection?: ScriptImageSelection | null;
  t: Translate;
}) {
  const tab = input.tab;
  if (!tab || input.isSharing) {
    return false;
  }

  const outputPath = buildScriptImagePath(tab.cdbPath, tab.cardCode);
  if (appSettingsState.values.saveScriptImageToLocal && !outputPath) {
    showToast(input.t('editor.script_export_image_failed'), 'error');
    return false;
  }

  try {
    const blob = await buildScriptImageBlob({
      content: input.selection?.content ?? tab.content,
      lineNumberStart: input.selection?.startLineNumber,
      renderInfo: input.renderInfo,
    });
    await writeImageBlobToClipboard(blob);

    if (appSettingsState.values.saveScriptImageToLocal && outputPath) {
      await writeBinaryFile(outputPath, await blobToUint8Array(blob));
      showToast(input.t('editor.script_export_image_success', { values: { path: outputPath } }), 'success');
      return true;
    }

    showToast(input.t('editor.script_copy_image_success'), 'success');
    return true;
  } catch (error) {
    console.error('Failed to share script image', error);
    void writeErrorLog({
      source: 'script.share-image',
      error,
      extra: {
        scriptPath: tab.scriptPath,
        cardCode: tab.cardCode,
        outputPath,
        saveScriptImageToLocal: appSettingsState.values.saveScriptImageToLocal,
        selectionStartLineNumber: input.selection?.startLineNumber ?? null,
      },
    });
    showToast(input.t('editor.script_export_image_failed'), 'error');
    return false;
  }
}
