import type { CardDataEntry } from '$lib/types';
import {
  CARD_IMAGE_FORM_KEYS,
  normalizeCardImageFormData,
  type CardImageFormData,
} from '$lib/features/card-image/layout';
import type {
  WorkspaceAiContextRef,
  WorkspaceAiProposal,
} from '$lib/modules/card/workbench/workspaceMetadataState.svelte';

export type AiProposalPayload = {
  text: string;
  contextRefs: WorkspaceAiContextRef[];
  cardPatch?: Partial<CardDataEntry>;
  scriptContent?: string;
  imagePatch?: AiImagePatch;
};

export type AiImagePatch = {
  form: Partial<CardImageFormData>;
  exportScalePercent?: number;
};

const CARD_PATCH_KEYS = new Set<keyof CardDataEntry>([
  'code',
  'alias',
  'setcode',
  'type',
  'attack',
  'defense',
  'level',
  'race',
  'attribute',
  'category',
  'ot',
  'name',
  'desc',
  'strings',
  'lscale',
  'rscale',
  'linkMarker',
  'ruleCode',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeNumeric(value: unknown) {
  const numberValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function normalizeStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? '')).slice(0, 16)
    : null;
}

function normalizeNumberArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => normalizeNumeric(item)).filter((item): item is number => item !== null)
    : null;
}

export function normalizeCardPatch(value: unknown): Partial<CardDataEntry> | null {
  if (!isRecord(value)) return null;

  const patch: Partial<CardDataEntry> = {};
  for (const [rawKey, rawValue] of Object.entries(value)) {
    const key = rawKey as keyof CardDataEntry;
    if (!CARD_PATCH_KEYS.has(key)) continue;

    if (key === 'name' || key === 'desc') {
      patch[key] = String(rawValue ?? '') as never;
      continue;
    }

    if (key === 'strings') {
      const strings = normalizeStringArray(rawValue);
      if (strings) patch.strings = strings;
      continue;
    }

    if (key === 'setcode') {
      const setcode = normalizeNumberArray(rawValue);
      if (setcode) patch.setcode = setcode;
      continue;
    }

    const numeric = normalizeNumeric(rawValue);
    if (numeric !== null) {
      (patch as Record<string, number>)[key] = numeric;
    }
  }

  return Object.keys(patch).length > 0 ? patch : null;
}

function parseJsonBlock(text: string) {
  const candidates = [
    ...text.matchAll(/```json\s*([\s\S]*?)```/gi),
    ...text.matchAll(/```\s*(\{[\s\S]*?\})\s*```/gi),
  ].map((match) => match[1]);

  if (text.trim().startsWith('{')) {
    candidates.unshift(text.trim());
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}

export function extractCardPatch(text: string) {
  const parsed = parseJsonBlock(text);
  if (!isRecord(parsed)) return null;

  if ('cardPatch' in parsed) {
    return normalizeCardPatch(parsed.cardPatch);
  }

  return normalizeCardPatch(parsed);
}

export function normalizeImagePatch(value: unknown): AiImagePatch | null {
  if (!isRecord(value)) return null;

  const formSource = isRecord(value.form) ? value.form : value;
  const normalizedForm = normalizeCardImageFormData(formSource as Partial<CardImageFormData>);
  const form: Partial<CardImageFormData> = {};
  for (const key of CARD_IMAGE_FORM_KEYS) {
    if (!(key in formSource)) continue;
    (form as Record<string, unknown>)[key] = normalizedForm[key];
  }

  const exportScalePercent = normalizeNumeric(value.exportScalePercent);
  if (Object.keys(form).length === 0 && exportScalePercent === null) return null;

  return {
    form,
    ...(exportScalePercent === null ? {} : { exportScalePercent }),
  };
}

export function extractImagePatch(text: string) {
  const parsed = parseJsonBlock(text);
  if (!isRecord(parsed) || !('imagePatch' in parsed)) return null;
  return normalizeImagePatch(parsed.imagePatch);
}

export function extractLuaBlock(text: string) {
  const match = text.match(/```lua\s*([\s\S]*?)```/i);
  return match?.[1]?.trim() || '';
}

export function readProposalPayload(proposal: WorkspaceAiProposal): AiProposalPayload {
  const payload = (proposal as { payload?: unknown }).payload;
  return isRecord(payload)
    ? {
        text: typeof payload.text === 'string' ? payload.text : '',
        contextRefs: Array.isArray(payload.contextRefs)
          ? payload.contextRefs as WorkspaceAiContextRef[]
          : [],
        cardPatch: normalizeCardPatch(payload.cardPatch) ?? undefined,
        scriptContent: typeof payload.scriptContent === 'string'
          ? payload.scriptContent
          : '',
        imagePatch: normalizeImagePatch(payload.imagePatch) ?? undefined,
      }
    : { text: '', contextRefs: [] };
}
