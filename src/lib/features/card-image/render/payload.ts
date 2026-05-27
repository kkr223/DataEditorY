import type { CardDataEntry } from '$lib/types';
import type { RenderCardPayload } from '$lib/types/render';
import type { CardImageFormData } from '../layout';
import { createCardBaseData, createDocumentEdits } from './document-edits';
import { createCardRenderResources, type CardRenderResourceOptions } from './resources';

export type CardRenderPayloadOptions = CardRenderResourceOptions;

export const createCardRenderPayload = async (
  sourceCard: CardDataEntry,
  data: CardImageFormData,
  options: CardRenderPayloadOptions = {},
): Promise<RenderCardPayload> => ({
  base: createCardBaseData(sourceCard, data),
  edits: createDocumentEdits(sourceCard, data),
  resources: await createCardRenderResources(data, options),
});
