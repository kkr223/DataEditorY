import type { CardDataEntry } from '$lib/types';
import type { ScriptGenerationStage } from '$lib/services/scriptGenerationStages';
import { tauriBridge } from '$lib/infrastructure/tauri';
import { getCardsByIds, modifyCard } from '$lib/stores/db';
import { setSingleSelectedCard } from '$lib/stores/editor.svelte';
import { showToast } from '$lib/stores/toast.svelte';
import { writeErrorLog } from '$lib/utils/errorLog';
import { cloneEditableCard, createEmptyCard } from '$lib/utils/card';
import { toPersistableCard } from '$lib/domain/card/draft';
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
import { getValidatedCardCode } from '$lib/features/card-editor/useCases';

type Translate = (key: string, options?: Record<string, unknown>) => string;

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

export async function generateCardScriptFlow(input: {
  activeCdbPath: string | null;
  activeTabId: string | null;
  draftCard: CardDataEntry;
  t: Translate;
  setIsGeneratingScript: (value: boolean) => void;
  setScriptGenerationStage: (value: ScriptGenerationStage | '') => void;
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

  const conflicts = await getCardsByIds(validCards.map((card) => Number(card.code)));
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
