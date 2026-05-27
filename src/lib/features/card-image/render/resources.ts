import type { CardRenderImageResource, CardRenderResources } from '$lib/types/render';
import { tauriBridge } from '$lib/infrastructure/tauri';
import { prepareCardRenderResource, releaseCardRenderResource } from '$lib/infrastructure/tauri/commands';
import type { CardImageFormData } from '../layout';

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

const getForegroundImageDataUrl = (
  data: CardImageFormData,
  foregroundImageUrl = '',
) => {
  if (!hasForegroundOverlay(data)) return undefined;

  const foregroundDataUrl = data.foregroundImage.trim();
  if (foregroundDataUrl) return foregroundDataUrl;

  const renderableUrl = foregroundImageUrl.trim();
  return renderableUrl.startsWith('data:') ? renderableUrl : undefined;
};

export const createCardRenderResources = async (
  data: CardImageFormData,
  options: CardRenderResourceOptions = {},
): Promise<CardRenderResources> => {
  const foregroundImageDataUrl = getForegroundImageDataUrl(data, options.foregroundImageUrl);
  const resourceCache = options.resourceCache ?? defaultResourceCache;

  return {
    artImage: await resourceCache.resolveDataUrl(data.image),
    foregroundImage: foregroundImageDataUrl ? await resourceCache.resolveDataUrl(foregroundImageDataUrl) : undefined,
  };
};
