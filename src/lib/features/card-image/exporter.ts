import type { CardDataEntry } from '$lib/types';
import { tauriBridge } from '$lib/infrastructure/tauri';
import { pathExists, writeBinaryFile } from '$lib/infrastructure/tauri/commands';
import { toMediaProtocolSrc } from '$lib/utils/mediaProtocol';
import {
  createCardImageFormData,
  normalizeCardImageFormData,
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
  if (!tauriBridge.isTauri()) {
    return `${window.location.origin}/resources/yugioh-card`;
  }

  if (!resourcePathPromise) {
    resourcePathPromise = tauriBridge.resolveResource('resources/yugioh-card')
      .then((path) => toMediaProtocolSrc(path))
      .catch((error) => {
        console.error('Failed to resolve yugioh-card resource path', error);
        resourcePathPromise = null;
        return `${window.location.origin}/resources/yugioh-card`;
      });
  }

  return resourcePathPromise;
}

function destroyRenderer(card: InstanceType<YugiohCardConstructor> | null | undefined) {
  if (!card) return;
  if (card.destroy) {
    card.destroy();
    return;
  }
  card.leafer?.destroy?.();
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
      pixelRatio: 1,
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
    destroyRenderer(exportCard);
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
    const candidate = await tauriBridge.join(artDir, `${cardId}.${extension}`);
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
}) {
  const base = createCardImageFormData(input.card, input.preset.language);
  const overrideForm = input.preset.usePerCardOverrides
    ? input.perCardDocument?.form ?? {}
    : {};

  return applyAutoRarityStyle(normalizeCardImageFormData({
    ...base,
    ...overrideForm,
    image: toMediaProtocolSrc(input.artPath),
    rare: input.preset.rare,
    laser: input.preset.laser,
    copyright: input.preset.copyright || base.copyright,
    scale: Math.max(0.1, input.preset.exportScalePercent / 100),
  }));
}

export async function exportBatchCardImage(input: {
  card: CardDataEntry;
  artPath: string;
  outputDir: string;
  preset: BatchCardImagePreset;
  perCardDocument?: CardImageConfigDocument | null;
  overwrite: boolean;
}) {
  const outputPath = await tauriBridge.join(input.outputDir, `${input.card.code}.jpg`);
  if (!input.overwrite && await pathExists(outputPath)) {
    return {
      cardId: input.card.code,
      outputPath,
      skipped: true,
    } satisfies BatchCardImageExportResult;
  }

  const data = buildBatchCardImageForm(input);
  const blob = await renderCardBlob(data, 'jpg', DEFAULT_JPG_QUALITY);
  const bytes = await blobToUint8Array(blob);
  await writeBinaryFile(outputPath, Array.from(bytes));

  let fieldOutputPath: string | undefined;
  if (isFieldSpellCard(data)) {
    const fieldBlob = await renderSquareJpgBlob(data.image, FIELD_SPELL_ART_SIZE, DEFAULT_JPG_QUALITY);
    const fieldBytes = await blobToUint8Array(fieldBlob);
    fieldOutputPath = await tauriBridge.join(input.outputDir, 'field', `${input.card.code}.jpg`);
    await writeBinaryFile(fieldOutputPath, Array.from(fieldBytes));
  }

  return {
    cardId: input.card.code,
    outputPath,
    fieldOutputPath,
  } satisfies BatchCardImageExportResult;
}
