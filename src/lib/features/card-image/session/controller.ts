import type { CardDataEntry } from '$lib/types';
import {
  createCardImageFormData,
  getCardImageLocaleDefaults,
  normalizeCardImageFormData,
  type CardImageFormData,
  type CardImageLanguage,
} from '../layout';
import type { CropBox } from '../crop/geometry';

type DragMode = 'move' | 'resize' | null;

export type CardImageSessionState = {
  form: CardImageFormData;
  croppedImageDataUrl: string;
  sourceImageWidth: number;
  sourceImageHeight: number;
  cropModalOpen: boolean;
  cropRotation: number;
  cropBox: CropBox;
  dragMode: DragMode;
  dragPointerId: number | null;
  hasManualPreviewZoom: boolean;
  previewZoomPercent: number;
  exportScalePercent: number;
  errorMessage: string;
  lastFormLanguage: CardImageLanguage;
  previewFontsReady: boolean;
};

export type CardImageSessionControllerOptions = {
  state: CardImageSessionState;
  getOpen: () => boolean;
  getCard: () => CardDataEntry;
  defaultPreviewZoomPercent: number;
  defaultExportScalePercent: number;
  revokeSourceImageUrl: () => void;
  revokeForegroundRenderableUrl: () => void;
  resetForegroundState: () => void;
  clearForegroundInitialState: () => void;
  destroyPreview: () => void;
  destroyForegroundPreview: () => void;
  resetResourceCache: () => void;
  warmupPreviewAfterFontsReady: () => Promise<void>;
};

const getHydrationKey = (open: boolean, card: CardDataEntry) => {
  if (!open) return '';

  return [
    card.code,
    card.alias,
    card.name,
    card.desc,
    card.type,
    card.attack,
    card.defense,
    card.level,
    card.race,
    card.attribute,
    card.strings?.join('|') ?? '',
  ].join('::');
};

export const createCardImageSessionController = ({
  state,
  getOpen,
  getCard,
  defaultPreviewZoomPercent,
  defaultExportScalePercent,
  revokeSourceImageUrl,
  revokeForegroundRenderableUrl,
  resetForegroundState,
  clearForegroundInitialState,
  destroyPreview,
  destroyForegroundPreview,
  resetResourceCache,
  warmupPreviewAfterFontsReady,
}: CardImageSessionControllerOptions) => {
  let lastHydrationKey = '';

  const resetImageState = () => {
    state.croppedImageDataUrl = '';
    state.sourceImageWidth = 0;
    state.sourceImageHeight = 0;
    state.cropModalOpen = false;
    state.cropRotation = 0;
    state.cropBox = { x: 0, y: 0, size: 0 };
    state.dragMode = null;
    state.dragPointerId = null;
    state.hasManualPreviewZoom = false;
    state.previewZoomPercent = defaultPreviewZoomPercent;
    state.exportScalePercent = defaultExportScalePercent;
    revokeSourceImageUrl();
  };

  const resetDrawerState = () => {
    lastHydrationKey = '';
    state.errorMessage = '';
    state.previewFontsReady = false;
    destroyPreview();
    destroyForegroundPreview();
    resetImageState();
    resetForegroundState();
    clearForegroundInitialState();
    revokeForegroundRenderableUrl();
    resetResourceCache();
  };

  const hydrateCard = (card: CardDataEntry, hydrationKey: string) => {
    lastHydrationKey = hydrationKey;
    state.form = createCardImageFormData(card);
    state.lastFormLanguage = state.form.language;
    resetImageState();
    resetForegroundState();
    clearForegroundInitialState();
    revokeForegroundRenderableUrl();
    resetResourceCache();
    destroyPreview();
    destroyForegroundPreview();
    void warmupPreviewAfterFontsReady();
  };

  const syncDrawerState = () => {
    const open = getOpen();
    const card = getCard();
    const hydrationKey = getHydrationKey(open, card);

    if (!open) {
      resetDrawerState();
      return;
    }

    if (hydrationKey !== lastHydrationKey) {
      hydrateCard(card, hydrationKey);
    }
  };

  const syncLanguageDefaults = () => {
    if (!getOpen()) return;

    const currentLanguage = state.form.language as CardImageLanguage;
    if (currentLanguage === state.lastFormLanguage) return;

    const card = getCard();
    const previousDefaults = getCardImageLocaleDefaults(card, state.lastFormLanguage);
    const nextDefaults = getCardImageLocaleDefaults(card, currentLanguage);

    state.form = normalizeCardImageFormData({
      ...state.form,
      monsterType: state.form.monsterType === previousDefaults.monsterType ? nextDefaults.monsterType : state.form.monsterType,
      description: state.form.description === previousDefaults.description ? nextDefaults.description : state.form.description,
      pendulumDescription: state.form.pendulumDescription === previousDefaults.pendulumDescription
        ? nextDefaults.pendulumDescription
        : state.form.pendulumDescription,
      copyright: state.form.copyright === previousDefaults.copyright ? nextDefaults.copyright : state.form.copyright,
    });
    state.lastFormLanguage = currentLanguage;
  };

  return {
    resetImageState,
    syncDrawerState,
    syncLanguageDefaults,
  };
};
