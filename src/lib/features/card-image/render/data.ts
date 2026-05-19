import { normalizeCardImageFormData, type CardImageFormData } from '../layout';

const CARD_RENDER_WIDTH = 1394;
const CARD_RENDER_HEIGHT = 2031;

type RenderDataSource = {
  form: CardImageFormData;
  croppedImageDataUrl: string;
};

type BuildVariantOptions = {
  hasExtraBuild: boolean;
};

const AUTO_RARITY_STYLE: Record<string, Pick<CardImageFormData, 'color' | 'gradient' | 'gradientColor1' | 'gradientColor2'>> = {
  ur: { color: '#f3cc63', gradient: true, gradientColor1: '#8a5d17', gradientColor2: '#f8e6a2' },
  gr: { color: '#d8dde6', gradient: true, gradientColor1: '#6d7683', gradientColor2: '#f4f7fb' },
  hr: { color: '#eef2f8', gradient: true, gradientColor1: '#8e99a9', gradientColor2: '#ffffff' },
  ser: { color: '#edf2f8', gradient: true, gradientColor1: '#8b95a4', gradientColor2: '#ffffff' },
  gser: { color: '#f1d377', gradient: true, gradientColor1: '#8a6422', gradientColor2: '#fff1be' },
  pser: { color: '#f5d6ef', gradient: true, gradientColor1: '#855f86', gradientColor2: '#fff5fd' },
};

export const applyAutoRarityStyle = (data: CardImageFormData): CardImageFormData => {
  const rarity = String(data.rare ?? '').trim().toLowerCase();
  if (!rarity || data.color || data.gradient) {
    return data;
  }

  const style = AUTO_RARITY_STYLE[rarity];
  return style ? { ...data, ...style } : data;
};

export const applyBuildVariantIsolation = (
  data: CardImageFormData,
  { hasExtraBuild }: BuildVariantOptions,
): CardImageFormData => {
  if (hasExtraBuild) {
    return data;
  }

  return normalizeCardImageFormData({
    ...data,
    foregroundImage: '',
    foregroundWidth: 0,
    foregroundHeight: 0,
    foregroundScale: 1,
    foregroundRotation: 0,
    foregroundX: CARD_RENDER_WIDTH / 2,
    foregroundY: CARD_RENDER_HEIGHT / 2,
    effectBlockEnabled: false,
    effectBlockColor: '#f6f2e8',
    effectBlockOpacity: 0.78,
  });
};

const createRenderData = (
  source: RenderDataSource,
  scale: number,
  variant: BuildVariantOptions,
) => applyAutoRarityStyle(applyBuildVariantIsolation(normalizeCardImageFormData({
  ...source.form,
  image: source.croppedImageDataUrl,
  scale,
}), variant));

export const createPreviewRenderData = (
  source: RenderDataSource,
  scale: number,
  variant: BuildVariantOptions,
) => createRenderData(source, Math.max(scale, 0.1), variant);

export const createJpgRenderData = (
  source: RenderDataSource,
  exportScalePercent: number,
  variant: BuildVariantOptions,
) => createRenderData(source, exportScalePercent / 100, variant);

export const createPngRenderData = (
  source: RenderDataSource,
  variant: BuildVariantOptions,
) => createRenderData(source, 1, variant);

export const createForegroundPreviewRenderData = (
  source: RenderDataSource,
) => applyAutoRarityStyle(normalizeCardImageFormData({
  ...source.form,
  image: source.croppedImageDataUrl,
  scale: 1,
}));

export const isFieldSpellRenderData = (data: CardImageFormData) => data.type === 'spell' && data.icon === 'field';
