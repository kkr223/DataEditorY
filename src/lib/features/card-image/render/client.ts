import { renderCardImage } from '$lib/infrastructure/tauri/commands';
import type { CardDataEntry } from '$lib/types';
import type { CardImageFormData } from '../layout';
import { convertImageBlobToJpg } from './blob';
import { createCardRenderPayload, type CardRenderPayloadOptions } from './payload';

export type CardRenderBlobType = 'png' | 'jpg';

export const renderCardPngBlob = async (
  sourceCard: CardDataEntry,
  data: CardImageFormData,
  options: CardRenderPayloadOptions = {},
) => {
  const payload = await createCardRenderPayload(sourceCard, data, options);
  const bytes = await renderCardImage(payload);
  return new Blob([new Uint8Array(bytes)], { type: 'image/png' });
};

export const renderCardBlob = async (
  sourceCard: CardDataEntry,
  data: CardImageFormData,
  type: CardRenderBlobType,
  options: CardRenderPayloadOptions = {},
  quality = 0.92,
) => {
  const pngBlob = await renderCardPngBlob(sourceCard, data, options);

  if (type === 'png') {
    return pngBlob;
  }

  return convertImageBlobToJpg(pngBlob, quality);
};
