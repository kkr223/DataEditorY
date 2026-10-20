import { get } from 'svelte/store';
import type { CardDataEntry } from '$lib/types';
import { tauriBridge } from '$lib/infrastructure/tauri';
import {
  activeTabId,
  deleteCardsInTab,
  queryCardByIdInTab,
  modifyCardsInTab,
  refreshSearchAfterMutation,
  replaceCardIdInTab,
} from '$lib/stores/db';
import { appSettingsState } from '$lib/stores/appSettings.svelte';
import { getAllCardsMap, setSingleSelectedCard, updateVisibleCards } from '$lib/stores/editor.svelte';
import { showToast } from '$lib/stores/toast.svelte';
import { writeErrorLog } from '$lib/utils/errorLog';
import { cloneEditableCard } from '$lib/domain/card/draft';
import { createCardSnapshot, toPersistableDraftCard } from '$lib/domain/card/draft';
import { getValidCardCode, validateCardDraft } from '$lib/domain/card/validation';
import {
  ensureCardScriptFile,
  getExistingCardScriptInfo,
  openCardScriptWorkspace,
  openScriptWithDefaultApp,
} from '$lib/services/cardScriptService';
import { activateCardSurface } from '$lib/modules/card/workbench/surfaceState.svelte';

type Translate = (key: string, options?: Record<string, unknown>) => string;

export function getValidatedCardCode(
  draftCard: CardDataEntry,
  t: Translate,
) {
  const code = getValidCardCode(draftCard);
  if (code === null) {
    showToast(t('editor.code_required'), 'error');
    return null;
  }

  return code;
}

export async function saveDraftCardFlow(input: {
  tabId: string;
  draftCard: CardDataEntry;
  originalCardCode: number | null;
  removeOriginal?: boolean;
  expectedTarget?: CardDataEntry | null;
  t: Translate;
  getDraftCard: () => CardDataEntry;
  canUpdateDraft: () => boolean;
  setDraftCard: (card: CardDataEntry) => void;
  setOriginalCardCode: (code: number | null) => void;
  setLastSyncedSelectedId: (code: number | null) => void;
  setLastLoadedCardSnapshot: (snapshot: string) => void;
  handleSearch: (preserveSelection?: boolean) => Promise<boolean>;
  refreshDraftImage: (code: number, bustCache?: boolean) => Promise<void>;
}) {
  const validationIssues = validateCardDraft(input.draftCard);
  if (validationIssues.some((issue) => issue.severity === 'error')) {
    showToast(input.t('editor.code_required'), 'error');
    return false;
  }
  for (const warning of validationIssues.filter((issue) => issue.severity === 'warning')) {
    showToast(input.t(`editor.card_warning_${warning.code.replaceAll('-', '_')}`), 'info');
  }

  const targetCode = Number(input.draftCard.code ?? 0);
  const nextCard = cloneEditableCard(input.draftCard);
  nextCard.code = targetCode;
  const dbCard = toPersistableDraftCard(nextCard);
  const submittedSnapshot = createCardSnapshot(nextCard);
  const draftMatches = (snapshot: string) => input.canUpdateDraft()
    && createCardSnapshot(cloneEditableCard(input.getDraftCard())) === snapshot;

  const shouldReplaceId = input.originalCardCode !== null
    && input.originalCardCode !== targetCode;
  const mutationTabId = input.tabId;
  const ok = shouldReplaceId
    ? await replaceCardIdInTab(mutationTabId, dbCard, input.originalCardCode as number, false, !!input.removeOriginal, input.expectedTarget ?? null)
    : await modifyCardsInTab(mutationTabId, [dbCard], false,
      input.expectedTarget === undefined ? undefined : [input.expectedTarget]);
  if (!ok) {
    showToast(input.t('editor.save_failed'), 'error');
    return false;
  }

  const committedSnapshot = createCardSnapshot(dbCard);
  if (input.canUpdateDraft()) {
    // Acknowledge exactly the submitted version, retaining edits made during I/O.
    if (draftMatches(submittedSnapshot)) input.setDraftCard(cloneEditableCard(dbCard));
    input.setLastSyncedSelectedId(targetCode);
    input.setLastLoadedCardSnapshot(committedSnapshot);
    input.setOriginalCardCode(targetCode);
  }
  await refreshSearchAfterMutation(mutationTabId, () => input.handleSearch(true));
  if (input.canUpdateDraft()) {
    updateVisibleCards([dbCard]);
    if (draftMatches(committedSnapshot) && getAllCardsMap().has(targetCode)) setSingleSelectedCard(targetCode);
    await input.refreshDraftImage(targetCode, true);
  }
  if (!draftMatches(committedSnapshot)) {
    showToast(input.t('editor.draft_changed_during_save'), 'info');
    // Callers must not navigate away or save the CDB while a newer draft remains.
    return false;
  }
  showToast(
    input.t('editor.card_modified', { values: { code: String(targetCode) } }),
    'success',
  );
  return true;
}

async function reviewTargetCard(tabId: string, code: number, originalCode: number | null, t: Translate) {
  try {
    const card = await queryCardByIdInTab(tabId, code) ?? null;
    if (card && card.code !== originalCode) {
      const confirmed = await tauriBridge.ask(
        t('editor.overwrite_target_confirm', { values: { code: String(code) } }),
        { title: t('editor.overwrite_target_title'), kind: 'warning' },
      );
      if (!confirmed) return { approved: false } as const;
    }
    return { approved: true, card } as const;
  } catch (error) {
    console.error('Failed to inspect the target card:', error);
    showToast(t('editor.save_failed'), 'error');
    return { approved: false } as const;
  }
}

export async function modifyDraftCardFlow(input: {
  tabId: string;
  draftCard: CardDataEntry;
  originalCardCode: number | null;
  isEditingExisting: boolean;
  t: Translate;
  saveDraftCard: (targetCode: number, removeOriginal?: boolean, expectedTarget?: CardDataEntry | null) => Promise<boolean>;
}) {
  const targetCode = getValidatedCardCode(input.draftCard, input.t);
  if (!targetCode) return false;

  if (input.isEditingExisting && input.originalCardCode === targetCode) {
    return input.saveDraftCard(targetCode);
  }

  const target = await reviewTargetCard(input.tabId, targetCode, input.originalCardCode, input.t);
  if (!target.approved) return false;

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

    return input.saveDraftCard(targetCode, !!removeOriginal, target.card);
  }

  return input.saveDraftCard(targetCode, false, target.card);
}

export async function saveAsDraftCardFlow(input: {
  tabId: string;
  draftCard: CardDataEntry;
  originalCardCode: number | null;
  t: Translate;
  saveDraftCard: (targetCode: number, removeOriginal?: boolean, expectedTarget?: CardDataEntry | null) => Promise<boolean>;
}) {
  const targetCode = getValidatedCardCode(input.draftCard, input.t);
  if (!targetCode) return;

  const target = await reviewTargetCard(input.tabId, targetCode, input.originalCardCode, input.t);
  if (!target.approved) return false;
  return input.saveDraftCard(targetCode, false, target.card);
}

export async function deleteDraftCardFlow(input: {
  tabId: string;
  originalCardCode: number | null;
  selectedCardIds?: number[];
  t: Translate;
  resetDraftCard: () => void;
  clearSelection: () => void;
  handleSearch: (preserveSelection?: boolean) => Promise<boolean>;
}) {
  const cardIds = [...new Set(input.selectedCardIds?.length
    ? input.selectedCardIds
    : input.originalCardCode === null ? [] : [input.originalCardCode])];
  if (cardIds.length === 0) return;
  const multiple = cardIds.length > 1;

  const confirmed = await tauriBridge.ask(
    input.t(multiple ? 'editor.delete_selected_confirm' : 'editor.delete_confirm', {
      values: { code: String(cardIds[0]), count: String(cardIds.length) },
    }),
    {
      title: input.t(multiple ? 'editor.delete_selected_title' : 'editor.delete_confirm_title'),
      kind: 'warning',
    },
  );
  if (!confirmed) return;

  const mutationTabId = input.tabId;
  if (await deleteCardsInTab(mutationTabId, cardIds, false)) {
    showToast(
      input.t(multiple ? 'editor.cards_deleted' : 'editor.card_deleted', {
        values: { code: String(cardIds[0]), count: String(cardIds.length) },
      }),
      'success',
    );
    await refreshSearchAfterMutation(mutationTabId, () => input.handleSearch());
    if (get(activeTabId) === mutationTabId) {
      input.clearSelection();
      input.resetDraftCard();
    }
  } else {
    showToast(input.t('editor.delete_failed'), 'error');
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
    const existingInfo = await getExistingCardScriptInfo(input.activeCdbPath, code, input.activeTabId);

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
        sourceTabId: input.activeTabId,
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
    if (!opened) return;

    activateCardSurface('script');

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
