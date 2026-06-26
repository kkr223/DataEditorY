import type { CardDataEntry } from '$lib/types';
import type { CardImageFormData } from '$lib/features/card-image/layout';
import type { AiProposalPayload } from './aiProposalPayload';
import { isSameCdbPath } from '$lib/domain/script/tabIdentity';

export type AiProposalDiffRow = {
  field: string;
  before: string;
  after: string;
};

function formatValue(value: unknown) {
  if (value === undefined) return '(unavailable)';
  if (typeof value === 'string') return value || '(empty)';
  return JSON.stringify(value);
}

export function buildAiProposalDiffRows(
  payload: AiProposalPayload,
  current: {
    card?: CardDataEntry | null;
    imageForm?: Partial<CardImageFormData> | null;
    exportScalePercent?: number;
    scriptContent?: string;
  },
): AiProposalDiffRow[] {
  const rows: AiProposalDiffRow[] = [];

  for (const [field, value] of Object.entries(payload.cardPatch ?? {})) {
    rows.push({
      field: `card.${field}`,
      before: formatValue(current.card?.[field as keyof CardDataEntry]),
      after: formatValue(value),
    });
  }

  for (const [field, value] of Object.entries(payload.imagePatch?.form ?? {})) {
    rows.push({
      field: `image.${field}`,
      before: formatValue(current.imageForm?.[field as keyof CardImageFormData]),
      after: formatValue(value),
    });
  }

  if (payload.imagePatch?.exportScalePercent !== undefined) {
    rows.push({
      field: 'image.exportScalePercent',
      before: formatValue(current.exportScalePercent),
      after: formatValue(payload.imagePatch.exportScalePercent),
    });
  }

  if (payload.scriptContent) {
    rows.push({
      field: 'script.content',
      before: formatValue(current.scriptContent),
      after: formatValue(payload.scriptContent),
    });
  }

  return rows;
}

export function getProposalCardCode(payload: AiProposalPayload) {
  const ref = payload.contextRefs.find((item) => item.type === 'card');
  const value = ref?.value;
  if (!value || typeof value !== 'object') return null;
  const code = Number((value as Record<string, unknown>).cardCode);
  return Number.isInteger(code) && code > 0 ? code : null;
}

export function isProposalContextActive(
  payload: AiProposalPayload,
  current: { cdbPath?: string; cdbTabId?: string; cardCode?: number },
) {
  const cdbRef = payload.contextRefs.find((item) => item.type === 'cdb');
  const cdbValue = cdbRef?.value && typeof cdbRef.value === 'object'
    ? cdbRef.value as Record<string, unknown>
    : null;
  const targetTabId = typeof cdbValue?.tabId === 'string' ? cdbValue.tabId : '';
  const targetPath = typeof cdbValue?.path === 'string' ? cdbValue.path : '';
  const cdbMatches = !cdbRef
    || Boolean(targetTabId && current.cdbTabId && targetTabId === current.cdbTabId)
    || Boolean(targetPath && current.cdbPath && isSameCdbPath(targetPath, current.cdbPath));

  const targetCardCode = getProposalCardCode(payload);
  const cardMatches = targetCardCode === null || targetCardCode === current.cardCode;
  return cdbMatches && cardMatches;
}
