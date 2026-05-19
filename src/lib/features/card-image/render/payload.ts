import type { CardDataEntry } from '$lib/types';
import type { RenderCardPayload } from '$lib/types/render';
import type { CardImageFormData } from '../layout';
import { createCardRenderDraft } from './draft';
import { createCardRenderResources, type CardRenderResourceOptions } from './resources';

export type CardRenderPayloadOptions = CardRenderResourceOptions;

export const createCardRenderPayload = async (
  sourceCard: CardDataEntry,
  data: CardImageFormData,
  options: CardRenderPayloadOptions = {},
): Promise<RenderCardPayload> => ({
  draft: createCardRenderDraft(sourceCard, data),
  resources: await createCardRenderResources(data, options),
});
