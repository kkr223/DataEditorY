import { get } from 'svelte/store';
import type { CardDataEntry } from '$lib/types';
import { tauriBridge } from '$lib/infrastructure/tauri';
import {
  activeTabId,
  getCardsByIdsInTab,
  modifyCardsInTab,
  refreshSearchAfterMutation,
} from '$lib/stores/db';
import { getAllCardsMap, setSingleSelectedCard } from '$lib/stores/editor.svelte';
import { showToast } from '$lib/stores/toast.svelte';
import { cloneEditableCard, createEmptyCard } from '$lib/domain/card/draft';
import { toPersistableCard } from '$lib/domain/card/draft';
import { importCardImage } from '$lib/services/cardImageService';
import { getValidatedCardCode } from '$lib/features/card-editor/useCases';

type Translate = (key: string, options?: Record<string, unknown>) => string;

export async function pickCardImageFlow(input: {
  activeCdbPath: string | null;
  draftCard: CardDataEntry;
  t: Translate;
  refreshDraftImage: (code: number, bustCache?: boolean) => Promise<void>;
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
      await input.refreshDraftImage(targetCode, true);
    } catch (error) {
      console.error('Failed to copy image', error);
    }
  }
}

export async function saveParsedCardsIndividuallyFlow(input: {
  cards: CardDataEntry[];
  t: Translate;
  loadCardIntoDraft: (card: CardDataEntry) => void;
  handleSearch: (preserveSelection?: boolean) => Promise<boolean>;
  refreshDraftImage: (code: number, bustCache?: boolean) => Promise<void>;
}) {
  const mutationTabId = get(activeTabId);
  if (!mutationTabId) return false;
  const validCards = input.cards
    .map(cloneEditableCard)
    .filter((card) => Number.isInteger(Number(card.code ?? 0)) && Number(card.code ?? 0) > 0);
  if (validCards.length === 0) {
    showToast(input.t('editor.code_required'), 'error');
    return false;
  }

  const conflicts = await getCardsByIdsInTab(mutationTabId, validCards.map((card) => Number(card.code)));
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

  const savedCount = validCards.length;
  const lastSavedCard = cloneEditableCard(validCards[savedCount - 1]);
  const ok = await modifyCardsInTab(mutationTabId, validCards.map(toPersistableCard), false);
  if (!ok) {
    showToast(input.t('editor.save_failed'), 'error');
    return false;
  }

  await refreshSearchAfterMutation(mutationTabId, () => input.handleSearch(true));
  if (get(activeTabId) === mutationTabId) {
    input.loadCardIntoDraft(lastSavedCard);
    if (getAllCardsMap().has(lastSavedCard.code)) setSingleSelectedCard(lastSavedCard.code);
    await input.refreshDraftImage(lastSavedCard.code, true);
  }
  showToast(
    input.t('editor.ai_parse_multi_saved', {
      values: { count: String(savedCount) },
    }),
    'success',
  );
  return true;
}
