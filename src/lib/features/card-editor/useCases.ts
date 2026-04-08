import type { CardDataEntry } from '$lib/types';
import type { AgentStage } from '$lib/utils/ai';
import { tauriBridge } from '$lib/infrastructure/tauri';
import { deleteCard, getCardById, modifyCard } from '$lib/stores/db';
import { appSettingsState } from '$lib/stores/appSettings.svelte';
import { setSingleSelectedCard, updateVisibleCards } from '$lib/stores/editor.svelte';
import { showToast } from '$lib/stores/toast.svelte';
import { writeErrorLog } from '$lib/utils/errorLog';
import { cloneEditableCard, createEmptyCard } from '$lib/utils/card';
import { createCardSnapshot, toPersistableCard } from '$lib/domain/card/draft';
import {
  ensureCardScriptFile,
  openCardScriptWorkspace,
  openScriptWithDefaultApp,
} from '$lib/services/cardScriptService';
import { importCardImage, resolveCardImageSrc } from '$lib/services/cardImageService';
import {
  ensureAiReady,
  ensureScriptOverwriteConfirmed,
  generateCardScriptFile,
  isAbortError,
} from '$lib/services/scriptGeneration';
import { createAiAppContext } from '$lib/services/aiAppContext';
import { parseCardManuscript, runEditorInstruction } from '$lib/utils/ai';
import { createInitialParseManuscript } from '$lib/features/card-editor/controller';

type Translate = (key: string, options?: Record<string, unknown>) => string;

export function getValidatedCardCode(
  draftCard: CardDataEntry,
  t: Translate,
) {
  const code = Number(draftCard.code ?? 0);
  if (!Number.isInteger(code) || code <= 0) {
    showToast(t('editor.code_required'), 'error');
    return null;
  }

  return code;
}

export async function saveDraftCardFlow(input: {
  draftCard: CardDataEntry;
  originalCardCode: number | null;
  removeOriginal?: boolean;
  t: Translate;
  setDraftCard: (card: CardDataEntry) => void;
  setOriginalCardCode: (code: number | null) => void;
  setLastSyncedSelectedId: (code: number | null) => void;
  setLastLoadedCardSnapshot: (snapshot: string) => void;
  handleSearch: (preserveSelection?: boolean) => Promise<boolean>;
  refreshDraftImage: (code: number, bustCache?: boolean) => Promise<void>;
}) {
  const targetCode = Number(input.draftCard.code ?? 0);
  const nextCard = cloneEditableCard(input.draftCard);
  nextCard.code = targetCode;
  const dbCard = toPersistableCard(nextCard);

  const ok = await modifyCard(dbCard);
  if (!ok) {
    showToast(input.t('editor.save_failed'), 'error');
    return false;
  }

  if (input.removeOriginal && input.originalCardCode !== null && input.originalCardCode !== targetCode) {
    const deleted = await deleteCard(input.originalCardCode);
    if (!deleted) {
      showToast(input.t('editor.save_failed'), 'error');
      return false;
    }
  }

  input.setDraftCard(cloneEditableCard(dbCard));
  input.setLastSyncedSelectedId(targetCode);
  input.setLastLoadedCardSnapshot(createCardSnapshot(dbCard));
  updateVisibleCards([dbCard]);
  input.setOriginalCardCode(targetCode);
  setSingleSelectedCard(targetCode);
  await input.handleSearch(true);
  await input.refreshDraftImage(targetCode, true);
  showToast(
    input.t('editor.card_modified', { values: { code: String(targetCode) } }),
    'success',
  );
  return true;
}

export async function modifyDraftCardFlow(input: {
  draftCard: CardDataEntry;
  originalCardCode: number | null;
  isEditingExisting: boolean;
  t: Translate;
  saveDraftCard: (targetCode: number, removeOriginal?: boolean) => Promise<boolean>;
}) {
  const targetCode = getValidatedCardCode(input.draftCard, input.t);
  if (!targetCode) return;

  const existing = await getCardById(targetCode);
  if (input.isEditingExisting && input.originalCardCode === targetCode) {
    await input.saveDraftCard(targetCode);
    return;
  }

  if (input.isEditingExisting && input.originalCardCode !== targetCode) {
    const removeOriginal = await tauriBridge.ask(
      input.t('editor.replace_original_confirm', {
        values: {
          oldCode: String(input.originalCardCode),
          newCode: String(targetCode),
        },
      }),
      {
        title: input.t('editor.replace_original_title'),
        kind: 'warning',
      },
    );

    if (existing && existing.code !== input.originalCardCode) {
      const overwriteExisting = await tauriBridge.ask(
        input.t('editor.overwrite_target_confirm', {
          values: { code: String(targetCode) },
        }),
        {
          title: input.t('editor.overwrite_target_title'),
          kind: 'warning',
        },
      );
      if (!overwriteExisting) return;
    }

    await input.saveDraftCard(targetCode, !!removeOriginal);
    return;
  }

  if (existing) {
    const overwriteExisting = await tauriBridge.ask(
      input.t('editor.overwrite_target_confirm', {
        values: { code: String(targetCode) },
      }),
      {
        title: input.t('editor.overwrite_target_title'),
        kind: 'warning',
      },
    );
    if (!overwriteExisting) return;
  }

  await input.saveDraftCard(targetCode);
}

export async function saveAsDraftCardFlow(input: {
  draftCard: CardDataEntry;
  originalCardCode: number | null;
  t: Translate;
  saveDraftCard: (targetCode: number, removeOriginal?: boolean) => Promise<boolean>;
}) {
  const targetCode = getValidatedCardCode(input.draftCard, input.t);
  if (!targetCode) return;

  const existing = await getCardById(targetCode);
  if (existing && existing.code !== input.originalCardCode) {
    const overwriteExisting = await tauriBridge.ask(
      input.t('editor.overwrite_target_confirm', {
        values: { code: String(targetCode) },
      }),
      {
        title: input.t('editor.overwrite_target_title'),
        kind: 'warning',
      },
    );
    if (!overwriteExisting) return;
  }

  await input.saveDraftCard(targetCode, false);
}

export async function deleteDraftCardFlow(input: {
  originalCardCode: number | null;
  t: Translate;
  resetDraftCard: () => void;
  clearSelection: () => void;
  handleSearch: (preserveSelection?: boolean) => Promise<boolean>;
}) {
  if (input.originalCardCode === null) return;

  const confirmed = await tauriBridge.ask(
    input.t('editor.delete_confirm', {
      values: { code: String(input.originalCardCode) },
    }),
    {
      title: input.t('editor.delete_confirm_title'),
      kind: 'warning',
    },
  );
  if (!confirmed) return;

  if (await deleteCard(input.originalCardCode)) {
    showToast(
      input.t('editor.card_deleted', {
        values: { code: String(input.originalCardCode) },
      }),
      'success',
    );
    input.clearSelection();
    await input.handleSearch();
    input.resetDraftCard();
  }
}

export async function pickCardImageFlow(input: {
  activeCdbPath: string | null;
  draftCard: CardDataEntry;
  t: Translate;
  setImageSrc: (src: string) => void;
}) {
  if (!input.activeCdbPath) return;
  const targetCode = getValidatedCardCode(input.draftCard, input.t);
  if (!targetCode) return;

  const selected = await tauriBridge.open({
    multiple: false,
    filters: [{ name: 'Images', extensions: ['jpg', 'png', 'jpeg'] }],
  });
  if (selected && typeof selected === 'string') {
    try {
      await importCardImage({
        cdbPath: input.activeCdbPath,
        cardCode: targetCode,
        sourcePath: selected,
      });
      input.setImageSrc(await resolveCardImageSrc(input.activeCdbPath, targetCode, true));
    } catch (error) {
      console.error('Failed to copy image', error);
    }
  }
}

export async function openCardScriptFlow(input: {
  activeCdbPath: string | null;
  activeTabId: string | null;
  draftCard: CardDataEntry;
  t: Translate;
}) {
  if (!input.activeCdbPath) return;
  const code = getValidatedCardCode(input.draftCard, input.t);
  if (!code) return;

  try {
    const context = createAiAppContext();
    const existingInfo = await context.readCardScript(code, input.activeCdbPath);

    if (!existingInfo.exists) {
      const shouldCreate = await tauriBridge.ask(
        input.t('editor.script_create_confirm', {
          values: { code: String(code) },
        }),
        {
          title: input.t('editor.script_create_title'),
          kind: 'warning',
        },
      );

      if (!shouldCreate) return;
    }

    if (appSettingsState.values.useExternalScriptEditor) {
      const ensured = await ensureCardScriptFile({
        cdbPath: input.activeCdbPath,
        cardCode: code,
        cardName: input.draftCard.name ?? '',
      });

      await openScriptWithDefaultApp(ensured.path);

      if (ensured.createdFromTemplate) {
        showToast(
          input.t('editor.script_created', { values: { code: String(code) } }),
          'success',
        );
      }
      return;
    }

    const opened = await openCardScriptWorkspace({
      cdbPath: input.activeCdbPath,
      sourceTabId: input.activeTabId,
      cardCode: code,
      cardName: input.draftCard.name ?? '',
    });

    if (opened.createdFromTemplate) {
      showToast(
        input.t('editor.script_created', { values: { code: String(code) } }),
        'success',
      );
    }
  } catch (error) {
    console.error('Failed to open script', error);
    void writeErrorLog({
      source: 'editor.script.open',
      error,
      extra: { cdbPath: input.activeCdbPath ?? '', cardCode: code },
    });
    showToast(input.t('editor.script_open_failed'), 'error');
  }
}

export async function generateCardScriptFlow(input: {
  activeCdbPath: string | null;
  activeTabId: string | null;
  draftCard: CardDataEntry;
  t: Translate;
  setIsGeneratingScript: (value: boolean) => void;
  setScriptGenerationStage: (value: AgentStage | '') => void;
  setScriptGenerationAbortController: (value: AbortController | null) => void;
}) {
  if (!input.activeCdbPath) return;
  if (!(await ensureAiReady())) return;

  const code = getValidatedCardCode(input.draftCard, input.t);
  if (!code) return;

  const cardForScript = toPersistableCard(cloneEditableCard(input.draftCard));

  try {
    const shouldOverwrite = await ensureScriptOverwriteConfirmed(input.activeCdbPath, code);
    if (!shouldOverwrite) return;

    input.setIsGeneratingScript(true);
    input.setScriptGenerationStage('collecting_references');
    const abortController = new AbortController();
    input.setScriptGenerationAbortController(abortController);
    await generateCardScriptFile({
      cdbPath: input.activeCdbPath,
      sourceTabId: input.activeTabId,
      card: cardForScript,
      signal: abortController.signal,
      onStageChange: (stage) => {
        input.setScriptGenerationStage(stage);
      },
    });
    showToast(
      input.t('editor.script_generated', { values: { code: String(code) } }),
      'success',
    );
  } catch (error) {
    if (isAbortError(error)) {
      showToast(input.t('editor.script_generation_canceled'), 'info');
      return;
    }
    console.error('Failed to generate script', error);
    void writeErrorLog({
      source: 'editor.script.generate',
      error,
      extra: {
        cdbPath: input.activeCdbPath ?? '',
        cardCode: code,
        cardName: cardForScript.name ?? '',
      },
    });
    showToast(input.t('editor.script_generate_failed'), 'error');
  } finally {
    input.setIsGeneratingScript(false);
    input.setScriptGenerationStage('');
    input.setScriptGenerationAbortController(null);
  }
}

export async function saveParsedCardsIndividuallyFlow(input: {
  cards: CardDataEntry[];
  t: Translate;
  loadCardIntoDraft: (card: CardDataEntry) => void;
  handleSearch: (preserveSelection?: boolean) => Promise<boolean>;
  refreshDraftImage: (code: number, bustCache?: boolean) => Promise<void>;
}) {
  const validCards = input.cards.filter((card) => Number.isInteger(Number(card.code ?? 0)) && Number(card.code ?? 0) > 0);
  if (validCards.length === 0) {
    showToast(input.t('editor.code_required'), 'error');
    return false;
  }

  const existingCards = await Promise.all(validCards.map((card) => getCardById(Number(card.code))));
  const conflicts = existingCards.filter((card) => card !== undefined);
  if (conflicts.length > 0) {
    const shouldOverwrite = await tauriBridge.ask(
      input.t('editor.ai_parse_multi_overwrite_confirm', {
        values: { count: String(conflicts.length) },
      }),
      {
        title: input.t('editor.ai_parse_multi_overwrite_title'),
        kind: 'warning',
      },
    );
    if (!shouldOverwrite) {
      return false;
    }
  }

  let savedCount = 0;
  let lastSavedCard: CardDataEntry | null = null;
  for (const card of validCards) {
    const ok = await modifyCard(toPersistableCard(card));
    if (!ok) {
      showToast(input.t('editor.save_failed'), 'error');
      return false;
    }

    savedCount += 1;
    lastSavedCard = cloneEditableCard(card);
  }

  if (!lastSavedCard) {
    return false;
  }

  input.loadCardIntoDraft(lastSavedCard);
  setSingleSelectedCard(lastSavedCard.code);
  await input.handleSearch(true);
  await input.refreshDraftImage(lastSavedCard.code, true);
  showToast(
    input.t('editor.ai_parse_multi_saved', {
      values: { count: String(savedCount) },
    }),
    'success',
  );
  return true;
}

export async function openParseModalFlow(input: {
  hasAiCapability: boolean;
  draftCard: CardDataEntry;
  setManuscriptInput: (value: string) => void;
  setParseModalOpen: (value: boolean) => void;
}) {
  if (!input.hasAiCapability) {
    return false;
  }

  if (!(await ensureAiReady())) {
    return false;
  }

  const initialManuscript = createInitialParseManuscript(input.draftCard);
  input.setManuscriptInput(initialManuscript);
  input.setParseModalOpen(true);
  return true;
}

export async function parseCardManuscriptFlow(input: {
  hasAiCapability: boolean;
  manuscriptInput: string;
  activeCdbPath: string | null;
  currentCardCode: number | null;
  prepareForImport?: () => Promise<void> | void;
  t: Translate;
  setIsParsingManuscript: (value: boolean) => void;
  setParseModalOpen: (value: boolean) => void;
  setDraftCard: (card: CardDataEntry) => void;
  syncSetcodesFromCard: (card: CardDataEntry) => void;
  afterDraftApplied: () => Promise<void>;
  handleModify: () => Promise<void>;
  saveParsedCardsIndividually: (cards: CardDataEntry[]) => Promise<boolean>;
}) {
  if (!input.hasAiCapability) {
    return false;
  }

  if (!input.manuscriptInput.trim()) {
    showToast(input.t('editor.ai_parse_empty'), 'info');
    return false;
  }

  try {
    input.setIsParsingManuscript(true);
    const result = await parseCardManuscript(
      input.manuscriptInput,
      createEmptyCard(),
      createAiAppContext(),
    );
    if (result.cards.length === 0) {
      showToast(input.t('editor.ai_parse_failed'), 'error');
      return false;
    }

    if (result.cards.length === 1) {
      const parsedCard = result.cards[0];
      await input.prepareForImport?.();
      input.setDraftCard(parsedCard);
      input.syncSetcodesFromCard(parsedCard);
      await input.afterDraftApplied();

      const targetCode = Number(parsedCard.code ?? 0);
      if (Number.isInteger(targetCode) && targetCode > 0) {
        await input.handleModify();
      } else {
        showToast(input.t('editor.ai_parse_applied_draft'), 'success');
      }
    } else {
      await input.prepareForImport?.();
      const saved = await input.saveParsedCardsIndividually(result.cards);
      if (!saved) {
        return false;
      }
    }

    input.setParseModalOpen(false);
    return true;
  } catch (error) {
    console.error('Failed to parse manuscript', error);
    void writeErrorLog({
      source: 'editor.ai.parse-manuscript',
      error,
      extra: {
        cdbPath: input.activeCdbPath ?? '',
        currentCardCode: input.currentCardCode ?? 0,
        manuscriptPreview: input.manuscriptInput.slice(0, 500),
      },
    });
    showToast(input.t('editor.ai_parse_failed'), 'error');
    return false;
  } finally {
    input.setIsParsingManuscript(false);
  }
}

export async function runEditorInstructionFlow(input: {
  hasAiCapability: boolean;
  instruction: string;
  activeCdbPath: string | null;
  currentCardCode: number | null;
  currentCard: CardDataEntry;
  t: Translate;
  setIsRunning: (value: boolean) => void;
  refreshAfterExecution: () => Promise<void>;
  setLastResult: (value: string) => void;
}) {
  if (!input.hasAiCapability) {
    return false;
  }

  if (!input.instruction.trim()) {
    showToast(input.t('editor.ai_instruction_empty'), 'info');
    return false;
  }

  try {
    input.setIsRunning(true);
    const result = await runEditorInstruction({
      instruction: input.instruction,
      currentCard: input.currentCard,
      context: createAiAppContext(),
    });

    input.setLastResult(result);
    await input.refreshAfterExecution();
    showToast(input.t('editor.ai_instruction_success'), 'success');
    return true;
  } catch (error) {
    console.error('Failed to run editor instruction', error);
    void writeErrorLog({
      source: 'editor.ai.instruction',
      error,
      extra: {
        cdbPath: input.activeCdbPath ?? '',
        currentCardCode: input.currentCardCode ?? 0,
        instructionPreview: input.instruction.slice(0, 500),
      },
    });
    showToast(input.t('editor.ai_instruction_failed'), 'error');
    return false;
  } finally {
    input.setIsRunning(false);
  }
}
