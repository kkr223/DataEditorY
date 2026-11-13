import { compressCardImageForExport } from './exportCompression';
import { host } from '#lib/platform/host/index.ts';
import { appSettingsState } from '#lib/stores/appSettings.svelte.ts';
import type { CardDataEntry } from '#lib/types/index.ts';
import { join } from '#lib/core/path.ts';
import { pathExists, writeBinaryFile } from '#lib/native/assetApi.ts';
import { toMediaProtocolSrc } from '#lib/utils/mediaProtocol.ts';
import { resolveWorkspaceCardImageAssetSrc } from './workspaceAssets';
import { destroyCardImageRenderer } from './rendererLifecycle';
import {
  applyCardImageRarityDefaults,
  createCardImageFormData,
  type CardImageConfigDocument,
  type CardImageFormData,
  type CardImageLanguage,
} from './layout';

type CardImageRenderData = CardImageFormData & {
  effectBlockBorderStyle: 'none' | 'default' | 'colored';
};

type YugiohCardConstructor = new (options: {
  view: HTMLElement;
  data: CardImageRenderData;
  resourcePath: string;
}) => {
  leafer?: {
    destroy?: () => void;
    export: (type: string, options?: Record<string, unknown>) => Promise<unknown>;
  };
  whenReady?: () => Promise<void>;
  export?: (type: string, options?: Record<string, unknown>) => Promise<unknown>;
  destroy?: () => void;
};

export type BatchCardImagePreset = {
  language: CardImageLanguage;
  rare: string;
  laser: string;
  copyright: string;
  exportScalePercent: number;
  usePerCardOverrides: boolean;
};

export type BatchCardImageExportResult = {
  cardId: number;
  outputPath?: string;
  fieldOutputPath?: string;
  skipped?: boolean;
  error?: string;
};

const FIELD_SPELL_ART_SIZE = 512;
const DEFAULT_JPG_QUALITY = 0.92;
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'bmp'];

let yugiohCardConstructorPromise: Promise<YugiohCardConstructor> | null = null;
let resourcePathPromise: Promise<string> | null = null;

async function getYugiohCardConstructor(): Promise<YugiohCardConstructor> {
  if (!yugiohCardConstructorPromise) {
    yugiohCardConstructorPromise = import('yugioh-card-ts')
      .then((module) => module.YugiohCard as YugiohCardConstructor);
  }
  return yugiohCardConstructorPromise;
}

async function getResourcePath() {
  if (host.kind !== 'tauri') {
    return `${window.location.origin}/resources/yugioh-card`;
  }

  if (!resourcePathPromise) {
    resourcePathPromise = host.media.resolveResource('resources/yugioh-card')
      .then((path) => toMediaProtocolSrc(path))
      .catch((error) => {
        console.error('Failed to resolve yugioh-card resource path', error);
        resourcePathPromise = null;
        return `${window.location.origin}/resources/yugioh-card`;
      });
  }

  return resourcePathPromise;
}

function applyAutoRarityStyle(data: CardImageFormData): CardImageFormData {
  const rarity = String(data.rare ?? '').trim().toLowerCase();
  if (!rarity || data.color || data.gradient) {
    return data;
  }

  const styleMap: Record<string, Pick<CardImageFormData, 'color' | 'gradient' | 'gradientColor1' | 'gradientColor2'>> = {
    ur: { color: '#f3cc63', gradient: true, gradientColor1: '#8a5d17', gradientColor2: '#f8e6a2' },
    gr: { color: '#d8dde6', gradient: true, gradientColor1: '#6d7683', gradientColor2: '#f4f7fb' },
    hr: { color: '#eef2f8', gradient: true, gradientColor1: '#8e99a9', gradientColor2: '#ffffff' },
    ser: { color: '#edf2f8', gradient: true, gradientColor1: '#8b95a4', gradientColor2: '#ffffff' },
    gser: { color: '#f1d377', gradient: true, gradientColor1: '#8a6422', gradientColor2: '#fff1be' },
    pser: { color: '#f5d6ef', gradient: true, gradientColor1: '#855f86', gradientColor2: '#fff5fd' },
  };

  const style = styleMap[rarity];
  return style ? { ...data, ...style } : data;
}

function buildYugiohCardData(data: CardImageFormData): CardImageRenderData {
  return {
    ...data,
    effectBlockBorderStyle: data.effectBlockEnabled
      ? data.effectBlockBorderStyle
      : 'none',
  };
}

async function exportYugiohCard(
  card: InstanceType<YugiohCardConstructor>,
  type: 'png' | 'jpg',
  options: Record<string, unknown>,
) {
  if (card.export) {
    return card.export(type, options);
  }
  await card.whenReady?.();
  return card.leafer?.export(type, options);
}

async function renderCardBlob(data: CardImageFormData, type: 'png' | 'jpg', quality?: number) {
  const YugiohCard = await getYugiohCardConstructor();
  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.left = '-99999px';
  host.style.top = '0';
  document.body.appendChild(host);
  let exportCard: InstanceType<YugiohCardConstructor> | null = null;

  try {
    exportCard = new YugiohCard({
      view: host,
      data: buildYugiohCardData(data),
      resourcePath: await getResourcePath(),
    });

    if (!exportCard.leafer) {
      throw new Error('Export renderer unavailable');
    }

    const exported = await exportYugiohCard(exportCard, type, {
      screenshot: true,
      pixelRatio: window.devicePixelRatio,
      blob: true,
      ...(quality !== undefined ? { quality } : {}),
    });
    const candidate = exported && typeof exported === 'object' && 'data' in exported
      ? (exported as { data: unknown }).data
      : exported;

    if (candidate instanceof Blob) {
      return candidate;
    }

    if (typeof candidate === 'string') {
      const response = await fetch(candidate);
      return await response.blob();
    }

    throw new Error('Export did not return a Blob');
  } finally {
    destroyCardImageRenderer(exportCard);
    host.remove();
  }
}

async function renderSquareJpgBlob(src: string, size: number, quality = DEFAULT_JPG_QUALITY) {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.src = src;
  await image.decode();

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas context unavailable');
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.clearRect(0, 0, size, size);
  context.drawImage(image, 0, 0, size, size);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', quality);
  });
  if (!blob) {
    throw new Error('Failed to render field spell art');
  }
  return blob;
}

async function blobToUint8Array(blob: Blob) {
  return new Uint8Array(await blob.arrayBuffer());
}

function isFieldSpellCard(data: CardImageFormData) {
  return data.type === 'spell' && data.icon === 'field';
}

export async function findBatchCardArtPath(artDir: string, cardId: number) {
  for (const extension of IMAGE_EXTENSIONS) {
    const candidate = join(artDir, `${cardId}.${extension}`);
    if (await pathExists(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function buildBatchCardImageForm(input: {
  card: CardDataEntry;
  artPath: string;
  preset: BatchCardImagePreset;
  perCardDocument?: CardImageConfigDocument | null;
  cdbPath?: string;
}) {
  const base = createCardImageFormData(input.card, input.preset.language);
  const overrideForm = input.preset.usePerCardOverrides
    ? input.perCardDocument?.form ?? {}
    : {};

  const previousDefaults = createCardImageFormData(input.card, overrideForm.language ?? input.preset.language);
  const localized = Object.fromEntries(
    (['monsterType', 'description', 'pendulumDescription'] as const).map((field) => [
      field, overrideForm[field] === undefined || overrideForm[field] === previousDefaults[field]
        ? base[field] : overrideForm[field],
    ]),
  );
  const resolveAsset = (value: string | undefined) => {
    if (value?.startsWith('workspace-asset:') && !input.cdbPath) {
      throw new Error('A source CDB path is required for saved card image assets');
    }
    return resolveWorkspaceCardImageAssetSrc(input.cdbPath ?? '', value ?? '');
  };
  const scalePercent = Number(input.preset.exportScalePercent);
  return applyAutoRarityStyle(applyCardImageRarityDefaults({
    ...base,
    ...overrideForm,
    ...localized,
    language: input.preset.language,
    image: toMediaProtocolSrc(input.artPath),
    foregroundImage: resolveAsset(overrideForm.foregroundImage),
    rarityMaskImage: resolveAsset(overrideForm.rarityMaskImage),
    rare: input.preset.rare,
    laser: input.preset.laser,
    copyright: input.preset.copyright || base.copyright,
    scale: (Number.isFinite(scalePercent) ? Math.min(100, Math.max(10, scalePercent)) : 43) / 100,
  }, input.preset.rare));
}

export async function exportBatchCardImage(input: {
  card: CardDataEntry;
  artPath: string;
  outputDir: string;
  preset: BatchCardImagePreset;
  perCardDocument?: CardImageConfigDocument | null;
  cdbPath?: string;
  overwrite: boolean;
  maxSizeKb?: number;
}) {
  const outputPath = join(input.outputDir, `${input.card.code}.jpg`);
  if (!input.overwrite && await pathExists(outputPath)) {
    return { cardId: input.card.code, outputPath, skipped: true } satisfies BatchCardImageExportResult;
  }
  const data = buildBatchCardImageForm(input);
  const fieldOutputPath = isFieldSpellCard(data)
    ? join(input.outputDir, 'field', `${input.card.code}.jpg`)
    : undefined;
  if (!input.overwrite && fieldOutputPath && await pathExists(fieldOutputPath)) {
    return { cardId: input.card.code, outputPath, fieldOutputPath, skipped: true } satisfies BatchCardImageExportResult;
  }

  const maxSizeKb = input.maxSizeKb ?? appSettingsState.values.cardImageMaxSizeKb ?? 0;
  const rendered = await renderCardBlob(data, 'jpg', DEFAULT_JPG_QUALITY);
  const blob = await compressCardImageForExport(rendered, 'jpg', maxSizeKb);
  const bytes = await blobToUint8Array(blob);
  let fieldBytes: Uint8Array | undefined;
  if (fieldOutputPath) {
    const renderedField = await renderSquareJpgBlob(data.image, FIELD_SPELL_ART_SIZE, DEFAULT_JPG_QUALITY);
    const fieldBlob = await compressCardImageForExport(renderedField, 'jpg', maxSizeKb);
    fieldBytes = await blobToUint8Array(fieldBlob);
  }
  await writeBinaryFile(outputPath, bytes);
  if (fieldOutputPath && fieldBytes) {
    await writeBinaryFile(fieldOutputPath, fieldBytes);
  }

  return { cardId: input.card.code, outputPath, fieldOutputPath } satisfies BatchCardImageExportResult;
}
