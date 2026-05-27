import type { CardDataEntry } from './cdb';
import type { CardImageFormData } from '$lib/features/card-image/layout';

export interface CardImageWorkspaceSnapshot {
  form: CardImageFormData;
  croppedImageDataUrl: string;
  exportScalePercent: number;
}

export interface CardImageWorkspaceState {
  id: string;
  cdbPath: string;
  sourceTabId: string | null;
  cardCode: number;
  cardName: string;
  card: CardDataEntry;
  snapshot: CardImageWorkspaceSnapshot | null;
}
