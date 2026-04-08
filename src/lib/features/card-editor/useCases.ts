import type { CardDataEntry } from '$lib/types';
import { tauriBridge } from '$lib/infrastructure/tauri';
import { deleteCard, getCardById, modifyCard } from '$lib/stores/db';
import { appSettingsState } from '$lib/stores/appSettings.svelte';
import { setSingleSelectedCard, updateVisibleCards } from '$lib/stores/editor.svelte';
import { showToast } from '$lib/stores/toast.svelte';
import { writeErrorLog } from '$lib/utils/errorLog';
import { cloneEditableCard } from '$lib/utils/card';
import { createCardSnapshot, toPersistableCard } from '$lib/domain/card/draft';
import {
  ensureCardScriptFile,
  getExistingCardScriptInfo,
  openCardScriptWorkspace,
  openScriptWithDefaultApp,
} from '$lib/services/cardScriptService';

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
    const existingInfo = await getExistingCardScriptInfo(input.activeCdbPath, code);

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
