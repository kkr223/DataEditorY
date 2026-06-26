import type { CardDataEntry } from '$lib/types';
import { tauriBridge } from '$lib/infrastructure/tauri';
import { getCardsByIds, modifyCard } from '$lib/stores/db';
import { setSingleSelectedCard } from '$lib/stores/editor.svelte';
import { showToast } from '$lib/stores/toast.svelte';
import { cloneEditableCard, createEmptyCard } from '$lib/domain/card/draft';
import { toPersistableCard } from '$lib/domain/card/draft';
import { importCardImage, resolveCardImageSrc } from '$lib/services/cardImageService';
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
