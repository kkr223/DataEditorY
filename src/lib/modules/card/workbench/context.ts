import type { CardDataEntry } from '$lib/types';

export type CardWorkbenchContext = {
  activeCdbPath: string | null;
  activeDocumentId: string | null;
  draftCard: CardDataEntry;
  imageSrc: string;
  isEditingExisting: boolean;
  t(key: string, options?: Record<string, unknown>): string;
  setImageSrc(value: string): void;
  setDraftCard(card: CardDataEntry): void;
  syncSetcodesFromCard(card: CardDataEntry): void;
  refreshDraftImage(code: number, bustCache?: boolean): Promise<void>;
  handleSearch(preserveSelection?: boolean): Promise<boolean>;
  handleModify(): Promise<void>;
  handleNewCard(): void;
  loadCardIntoDraft(card: CardDataEntry): void;
};
