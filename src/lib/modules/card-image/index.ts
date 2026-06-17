import { MemoryDocumentProvider, type ExtensionModule } from '$lib/platform';
import {
  normalizeCardImageFormData,
  type CardImageConfigDocument,
} from '$lib/features/card-image/layout';
import {
  CARD_IMAGE_CONFIG_TYPE,
  CARD_IMAGE_PROVIDER_ID,
} from './constants';

export {
  CARD_IMAGE_CONFIG_TYPE,
  CARD_IMAGE_PROVIDER_ID,
} from './constants';

const validateConfig = (value: unknown): CardImageConfigDocument => {
  if (!value || typeof value !== 'object') {
    throw new Error('Card image config must be an object');
  }
  const input = value as Partial<CardImageConfigDocument>;
  return {
    kind: 'dataeditory-card-image-config',
    version: 1,
    form: normalizeCardImageFormData(input.form ?? {}),
    exportScalePercent: input.exportScalePercent,
    meta: input.meta,
  };
};

export const cardImageModule: ExtensionModule = {
  id: 'card-image',
  dependencies: ['card'],
  dataTypes: [{
    typeId: CARD_IMAGE_CONFIG_TYPE,
    version: 1,
    validate: validateConfig,
  }],
  providers: [{
    id: CARD_IMAGE_PROVIDER_ID,
    typeIds: [CARD_IMAGE_CONFIG_TYPE],
    create: () => new MemoryDocumentProvider(),
  }],
  codecs: [{
    id: 'card-image.json-codec',
    typeId: CARD_IMAGE_CONFIG_TYPE,
    filePatterns: ['*-card-image.json'],
    canCreate: true,
    async decode(source, context) {
      const parsed = validateConfig(JSON.parse(await context.readText(source.path ?? source.uri)));
      return {
        typeId: CARD_IMAGE_CONFIG_TYPE,
        schemaVersion: 1,
        title: source.name,
        providerId: CARD_IMAGE_PROVIDER_ID,
        providerInput: parsed,
      };
    },
    async encode(document, destination, context) {
      const snapshot = validateConfig(await document.snapshot());
      await context.writeText(
        destination.path ?? destination.uri,
        `${JSON.stringify(snapshot, null, 2)}\n`,
      );
    },
  }],
  workbenches: [{
    id: 'card-image.workbench',
    acceptedTypeIds: [CARD_IMAGE_CONFIG_TYPE],
    component: () => import('./workbench/CardImageWorkbench.svelte'),
  }],
  workbenchContributions: [{
    id: 'card-image.card-actions',
    workbenchId: 'card.workbench',
    slot: 'footer-actions',
    order: 30,
    component: () => import('./workbench/CardImageContribution.svelte'),
  }],
};
