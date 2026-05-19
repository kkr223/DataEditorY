import type { CardRenderImageResource, CardRenderResources } from '$lib/types/render';
import { tauriBridge } from '$lib/infrastructure/tauri';
import { prepareCardRenderResource, releaseCardRenderResource } from '$lib/infrastructure/tauri/commands';
import type { CardImageFormData } from '../layout';

const RENDER_CARD_WIDTH = 1394;
const RENDER_CARD_HEIGHT = 2031;

export type CardRenderResourceOptions = {
  foregroundImageUrl?: string;
  resourceCache?: CardRenderResourceCache;
};

export type CardRenderResourceCache = {
  resolveDataUrl: (dataUrl: string) => Promise<CardRenderImageResource | undefined>;
  releaseAll: () => Promise<void>;
};

type DataUrlRenderResource = Extract<CardRenderImageResource, { kind: 'dataUrl' }>;

const hasForegroundOverlay = (data: CardImageFormData) => Boolean(
  data.foregroundImage.trim()
    && data.foregroundWidth > 0
    && data.foregroundHeight > 0
    && data.foregroundScale > 0,
);

const createDataUrlResource = (dataUrl: string): DataUrlRenderResource | undefined => {
  const trimmed = dataUrl.trim();
  return trimmed ? { kind: 'dataUrl', dataUrl: trimmed } : undefined;
};

export const createCardRenderResourceCache = (): CardRenderResourceCache => {
  const resources = new Map<string, Promise<CardRenderImageResource | undefined>>();
  let disposed = false;

  const resolveDataUrl = async (dataUrl: string) => {
    const fallbackResource = createDataUrlResource(dataUrl);
    if (!fallbackResource) return undefined;
    if (!tauriBridge.isTauri() || disposed) return fallbackResource;

    const cacheKey = fallbackResource.dataUrl;
    const cached = resources.get(cacheKey);
    if (cached) return cached;

    const prepared = prepareCardRenderResource(cacheKey)
      .then(({ token }) => ({ kind: 'resourceToken' as const, token }))
      .catch((error) => {
        resources.delete(cacheKey);
        throw error;
      });
    resources.set(cacheKey, prepared);
    return prepared;
  };

  const releaseAll = async () => {
    disposed = true;
    const preparedResources = await Promise.allSettled(resources.values());
    resources.clear();

    await Promise.all(preparedResources
      .filter((result): result is PromiseFulfilledResult<CardRenderImageResource | undefined> => result.status === 'fulfilled')
      .map((result) => result.value)
      .filter((resource): resource is Extract<CardRenderImageResource, { kind: 'resourceToken' }> => resource?.kind === 'resourceToken')
      .map((resource) => releaseCardRenderResource(resource.token).catch(() => undefined)));
  };

  return { resolveDataUrl, releaseAll };
};

const defaultResourceCache = createCardRenderResourceCache();

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
  const resourceCache = options.resourceCache ?? defaultResourceCache;

  return {
    artImage: await resourceCache.resolveDataUrl(data.image),
    foregroundImage: foregroundImageDataUrl ? await resourceCache.resolveDataUrl(foregroundImageDataUrl) : undefined,
  };
};
