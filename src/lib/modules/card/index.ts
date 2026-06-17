import type { ExtensionModule } from '$lib/platform';
import {
  CARD_COLLECTION_TYPE,
  validateCardCollectionSnapshot,
} from './types';

export const cardModule: ExtensionModule = {
  id: 'card',
  dataTypes: [{
    typeId: CARD_COLLECTION_TYPE,
    version: 1,
    validate: validateCardCollectionSnapshot,
  }],
  workbenches: [{
    id: 'card.workbench',
    acceptedTypeIds: [CARD_COLLECTION_TYPE],
    component: () => import('./workbench/CardCollectionWorkbench.svelte'),
  }],
};

export * from './types';
export * from './searchExpression';
