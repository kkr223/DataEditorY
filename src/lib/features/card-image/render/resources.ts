import type { CardRenderImageResource, CardRenderResources } from '$lib/types/render';
import type { CardImageFormData } from '../layout';

const RENDER_CARD_WIDTH = 1394;
const RENDER_CARD_HEIGHT = 2031;

export type CardRenderResourceOptions = {
  foregroundImageUrl?: string;
};

const hasForegroundOverlay = (data: CardImageFormData) => Boolean(
  data.foregroundImage.trim()
    && data.foregroundWidth > 0
    && data.foregroundHeight > 0
    && data.foregroundScale > 0,
);

const createDataUrlResource = (dataUrl: string): CardRenderImageResource | undefined => {
  const trimmed = dataUrl.trim();
  return trimmed ? { kind: 'dataUrl', dataUrl: trimmed } : undefined;
};

const createForegroundOverlayDataUrl = async (
  data: CardImageFormData,
  foregroundImageUrl = '',
) => {
  if (!hasForegroundOverlay(data)) return undefined;

  const imageUrl = foregroundImageUrl.trim() || data.foregroundImage.trim();
  if (!imageUrl) return undefined;

  const image = new Image();
  image.src = imageUrl;
  await image.decode();

  const canvas = document.createElement('canvas');
  canvas.width = RENDER_CARD_WIDTH;
  canvas.height = RENDER_CARD_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas context unavailable');
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.translate(data.foregroundX, data.foregroundY);
  context.rotate((data.foregroundRotation * Math.PI) / 180);
  context.scale(data.foregroundScale, data.foregroundScale);
  context.drawImage(
    image,
    -data.foregroundWidth / 2,
    -data.foregroundHeight / 2,
    data.foregroundWidth,
    data.foregroundHeight,
  );
  context.restore();

  return canvas.toDataURL('image/png');
};

export const createCardRenderResources = async (
  data: CardImageFormData,
  options: CardRenderResourceOptions = {},
): Promise<CardRenderResources> => {
  const foregroundImageDataUrl = await createForegroundOverlayDataUrl(data, options.foregroundImageUrl);

  return {
    artImage: createDataUrlResource(data.image),
    foregroundImage: foregroundImageDataUrl ? createDataUrlResource(foregroundImageDataUrl) : undefined,
  };
};
