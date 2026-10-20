import { documentRuntime } from '$lib/platform/appRuntime';
import { recordUndoLabel } from '$lib/stores/tabs';
import { refreshCachedSearchForTab } from '$lib/stores/search';
import { getOpenScriptTab, getScriptTabsForCdb, saveScriptTab, updateScriptTabContent } from '$lib/stores/scriptEditor.svelte';
import { writeTextFile, readTextFile, pathExists } from '$lib/native/assetApi';
import { getCdbPathIdentity } from '$lib/core/workspace/cdbPathIdentity';
import { createCardImageFormData, normalizeCardImageFormData } from '$lib/features/card-image/layout';
import { applyAiScriptChange } from '$lib/features/ai/scriptChanges';
import type { WorkspaceAiPatch } from '$lib/features/ai/types';
import type { CardDataEntry } from '$lib/types';
import type { CardCollectionCommand } from '$lib/modules/card';
import { getCardImageDocumentForPath, setCardImageDocumentForPath } from './workspaceMetadataState.svelte';
import { applyAiCardChanges } from './aiCardChanges';
import { queueAiCardDraftPatch } from './aiProposalApplication.svelte';

// Workbench adapter: connects proposal use cases to document, script and image APIs.
export function createAiPatchApplier(access: {
  confirmConflict: () => Promise<boolean>;
  undoLabel: () => string;
}) {
  async function applyCardChanges(documentId: string, changes: Array<{ cardCode: number; before: unknown; patch: unknown }>) {
    return applyAiCardChanges(changes, {
      readCard: (cardId) => documentRuntime.query<CardDataEntry | null>(documentId, { kind: 'getById', cardId }),
      confirmConflict: access.confirmConflict,
      commit: (cards, expectedCards) => executeCardCommand(documentId, { kind: 'upsert', cards, expectedCards }),
    });
  }

  async function applyCardPatch(patch: Extract<WorkspaceAiPatch, { kind: 'card' }>) {
    const [card] = await applyCardChanges(patch.documentId, [patch]);
    const revision = documentRuntime.getDocument(patch.documentId)?.revision ?? -1;
    await refreshCachedSearchForTab(patch.documentId);
    queueAiCardDraftPatch({ id: patch.id, workspaceId: patch.documentId, cardCode: patch.cardCode,
      revision, patch: card });
  }

  async function applyBatchCardPatch(patch: Extract<WorkspaceAiPatch, { kind: 'batch-card' }>) {
    await applyCardChanges(patch.documentId, patch.cards);
    await refreshCachedSearchForTab(patch.documentId);
  }

  async function executeCardCommand(documentId: string, command: CardCollectionCommand) {
    const result = await documentRuntime.execute(documentId, command);
    if (!result.changed) throw new Error('CDB was not changed');
    recordUndoLabel(documentId, access.undoLabel());
  }

  async function applyScriptPatch(patch: Extract<WorkspaceAiPatch, { kind: 'script' }>) {
    const findOpenTab = () => patch.cardCode
      ? getOpenScriptTab(patch.cdbPath, patch.cardCode, patch.documentId)
      : getScriptTabsForCdb({ tabId: patch.documentId, path: patch.cdbPath }).find((tab) => (
        getCdbPathIdentity(tab.scriptPath) === getCdbPathIdentity(patch.path)
      ));
    const readCurrent = async () => {
      const tab = findOpenTab();
      if (tab) return tab.content;
      return await pathExists(patch.path) ? readTextFile(patch.path) : null;
    };
    await applyAiScriptChange(patch, {
      readCurrent,
      confirmConflict: access.confirmConflict,
      write: async (content) => {
        const openTab = findOpenTab();
        if (openTab) {
          updateScriptTabContent(openTab.id, content);
          if (!(await saveScriptTab(openTab.id))) {
            throw new Error(`Failed to save open script ${openTab.scriptPath}`);
          }
          return;
        }
        await writeTextFile(patch.path, content);
      },
    });
  }

  async function applyImagePatch(patch: Extract<WorkspaceAiPatch, { kind: 'image' }>) {
    const current = await getCardImageDocumentForPath(patch.cdbPath, patch.cardCode);
    const card = (patch.patch && typeof patch.patch === 'object' && 'card' in patch.patch)
      ? (patch.patch as { card?: CardDataEntry }).card
      : null;
    const baseForm = current?.form ?? createCardImageFormData(card ?? ({ code: patch.cardCode } as CardDataEntry));
    const formPatch = patch.patch && typeof patch.patch === 'object' && 'form' in patch.patch
      ? (patch.patch as { form?: Record<string, unknown> }).form ?? {}
      : patch.patch;
    await setCardImageDocumentForPath(patch.cdbPath, patch.cardCode, {
      kind: 'dataeditory-card-image-config',
      version: 1,
      ...current,
      form: normalizeCardImageFormData({
        ...baseForm,
        ...(formPatch as Record<string, unknown>),
      }),
      exportScalePercent: typeof (patch.patch as { exportScalePercent?: unknown })?.exportScalePercent === 'number'
        ? (patch.patch as { exportScalePercent: number }).exportScalePercent
        : current?.exportScalePercent,
      meta: {
        ...(current?.meta ?? {}),
        cardCode: patch.cardCode,
      },
    });
  }

  async function applyPatch(patch: WorkspaceAiPatch) {
    const owner = documentRuntime.snapshot.documents.find(document => document.typeId === 'ygo.card-collection'
      && getCdbPathIdentity(document.source?.path ?? document.source?.uri ?? '') === getCdbPathIdentity(patch.cdbPath));
    if (!owner) throw new Error(`Workspace is no longer open: ${patch.cdbPath}`);
    patch = { ...patch, documentId: owner.id };
    if (patch.kind === 'card') return applyCardPatch(patch);
    if (patch.kind === 'batch-card') return applyBatchCardPatch(patch);
    if (patch.kind === 'script') return applyScriptPatch(patch);
    if (patch.kind === 'script-test-plan') throw new Error('Script test plans are disabled');
    return applyImagePatch(patch);
  }

  return applyPatch;
}
