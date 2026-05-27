import { tick } from 'svelte';
import type { CardDataEntry } from '$lib/types';
import type { CardImageFormData } from '../layout';
import {
  createForegroundPreviewRenderData,
  createJpgRenderData,
  createPngRenderData,
  createPreviewRenderData,
} from './data';
import {
  renderCardBlob as renderCardBlobForCard,
  renderCardPngBlob as renderCardPngBlobForCard,
} from './client';
import {
  createCardRenderResourceCache,
  type CardRenderResourceCache,
} from './resources';
import { trackCardImagePreviewDependencies } from './dependencies';
import { createCardImageExportActions } from './export';
import { FOREGROUND_EDITOR_CARD_HEIGHT, FOREGROUND_EDITOR_CARD_WIDTH } from '../foreground/geometry';

const CARD_WIDTH = FOREGROUND_EDITOR_CARD_WIDTH;
const CARD_HEIGHT = FOREGROUND_EDITOR_CARD_HEIGHT;
const MIN_PREVIEW_ZOOM_PERCENT = 60;
const MAX_PREVIEW_ZOOM_PERCENT = 170;
const DEFAULT_PREVIEW_ZOOM_PERCENT = 108;
const PREVIEW_ZOOM_REFERENCE_WIDTH = 560;
const PREVIEW_ZOOM_REFERENCE_HEIGHT = 800;
const PREVIEW_RENDER_DEBOUNCE_MS = 160;
const PREVIEW_ZOOM_RENDER_DEBOUNCE_MS = 420;
const MAX_PREVIEW_DEVICE_PIXEL_RATIO = 2;

export type CardImageRenderState = {
  form: CardImageFormData;
  previewHost: HTMLDivElement | null;
  previewImageUrl: string;
  foregroundPreviewHost: HTMLDivElement | null;
  foregroundPreviewImageUrl: string;
  foregroundRenderableUrl: string;
  croppedImageDataUrl: string;
  previewWidth: number;
  previewHeight: number;
  foregroundPreviewWidth: number;
  foregroundPreviewHeight: number;
  foregroundRenderWidth: number;
  foregroundRenderHeight: number;
  foregroundRenderOffsetX: number;
  foregroundRenderOffsetY: number;
  previewZoomPercent: number;
  hasManualPreviewZoom: boolean;
  exportScalePercent: number;
  isDownloading: boolean;
  isSavingJpg: boolean;
  errorMessage: string;
  previewFontsReady: boolean;
};

export type CardImageRenderControllerOptions = {
  state: CardImageRenderState;
  hasExtraBuild: boolean;
  getOpen: () => boolean;
  getCard: () => CardDataEntry;
  getCdbPath: () => string;
  onSavedJpg: () => void | Promise<void>;
  t: (key: string, options?: Record<string, unknown>) => string;
  measureForegroundRenderBounds: () => void;
};

const revokeBlobUrl = (url: string) => {
  if (url.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
};

export const createCardImageRenderController = ({
  state,
  hasExtraBuild,
  getOpen,
  getCard,
  getCdbPath,
  onSavedJpg,
  t,
  measureForegroundRenderBounds,
}: CardImageRenderControllerOptions) => {
  let previewTimer: ReturnType<typeof setTimeout> | null = null;
  let previewZoomTimer: ReturnType<typeof setTimeout> | null = null;
  let previewWarmupTimer: ReturnType<typeof setTimeout> | null = null;
  let foregroundPreviewTimer: ReturnType<typeof setTimeout> | null = null;
  let previewRenderToken = 0;
  let foregroundPreviewRenderToken = 0;
  let renderResourceCache: CardRenderResourceCache = createCardRenderResourceCache();

  const replacePreviewImageUrl = (url: string) => {
    if (state.previewImageUrl !== url) {
      revokeBlobUrl(state.previewImageUrl);
    }
    state.previewImageUrl = url;
  };

  const replaceForegroundPreviewImageUrl = (url: string) => {
    if (state.foregroundPreviewImageUrl !== url) {
      revokeBlobUrl(state.foregroundPreviewImageUrl);
    }
    state.foregroundPreviewImageUrl = url;
  };

  const destroyPreview = () => {
    previewRenderToken += 1;
    replacePreviewImageUrl('');
  };

  const destroyForegroundPreview = () => {
    foregroundPreviewRenderToken += 1;
    replaceForegroundPreviewImageUrl('');
  };

  const resetResourceCache = () => {
    const currentCache = renderResourceCache;
    renderResourceCache = createCardRenderResourceCache();
    void currentCache.releaseAll();
  };

  const getAutoPreviewZoomPercent = () => {
    if (!state.previewWidth || !state.previewHeight) {
      return DEFAULT_PREVIEW_ZOOM_PERCENT;
    }

    const widthRatio = state.previewWidth / PREVIEW_ZOOM_REFERENCE_WIDTH;
    const heightRatio = state.previewHeight / PREVIEW_ZOOM_REFERENCE_HEIGHT;
    const scaledPercent = Math.min(widthRatio, heightRatio) * 100;

    return Math.round(
      Math.max(DEFAULT_PREVIEW_ZOOM_PERCENT, Math.min(MAX_PREVIEW_ZOOM_PERCENT, scaledPercent)),
    );
  };

  const getPreviewScale = () => {
    const availableWidth = Math.max(state.previewWidth - 16, 1);
    const availableHeight = Math.max(state.previewHeight - 40, 1);
    const baseScale = Math.min(availableWidth / CARD_WIDTH, availableHeight / CARD_HEIGHT);
    return Math.max(baseScale * (state.previewZoomPercent / 100), 0.02);
  };

  const getPreviewDevicePixelRatio = () => {
    if (typeof window === 'undefined') return 1;
    const ratio = Number(window.devicePixelRatio) || 1;
    return Math.max(1, Math.min(MAX_PREVIEW_DEVICE_PIXEL_RATIO, ratio));
  };

  const getPreviewRenderScale = () => getPreviewScale() * getPreviewDevicePixelRatio();

  const getPreviewImageStyle = () => {
    const scale = getPreviewScale();
    return `width:${Math.round(CARD_WIDTH * scale)}px;height:${Math.round(CARD_HEIGHT * scale)}px;`;
  };

  const queuePreviewQualityRefresh = () => {
    clearTimeout(previewZoomTimer ?? undefined);
    previewZoomTimer = setTimeout(() => {
      void refreshPreview();
    }, PREVIEW_ZOOM_RENDER_DEBOUNCE_MS);
  };

  const adjustPreviewZoom = (delta: number) => {
    state.hasManualPreviewZoom = true;
    state.previewZoomPercent = Math.max(
      MIN_PREVIEW_ZOOM_PERCENT,
      Math.min(MAX_PREVIEW_ZOOM_PERCENT, state.previewZoomPercent + delta),
    );
    queuePreviewQualityRefresh();
  };

  const buildPreviewData = (): CardImageFormData => createPreviewRenderData({
    form: state.form,
    croppedImageDataUrl: state.croppedImageDataUrl,
  }, getPreviewRenderScale(), { hasExtraBuild });

  const buildJpgData = (): CardImageFormData => createJpgRenderData({
    form: state.form,
    croppedImageDataUrl: state.croppedImageDataUrl,
  }, state.exportScalePercent, { hasExtraBuild });

  const buildPngData = (): CardImageFormData => createPngRenderData({
    form: state.form,
    croppedImageDataUrl: state.croppedImageDataUrl,
  }, { hasExtraBuild });

  const buildForegroundPreviewData = (): CardImageFormData => createForegroundPreviewRenderData({
    form: state.form,
    croppedImageDataUrl: state.croppedImageDataUrl,
  });

  const handlePreviewWheel = (event: WheelEvent) => {
    event.preventDefault();
    const stepSize = event.ctrlKey || event.metaKey ? 8 : 5;
    const step = event.deltaY < 0 ? stepSize : -stepSize;
    adjustPreviewZoom(step);
  };

  const renderCardPngBlob = async (data: CardImageFormData) => renderCardPngBlobForCard(getCard(), data, {
    foregroundImageUrl: state.foregroundRenderableUrl,
    resourceCache: renderResourceCache,
  });

  const renderCardBlob = async (
    data: CardImageFormData,
    type: 'png' | 'jpg',
    quality?: number,
  ) => renderCardBlobForCard(getCard(), data, type, {
    foregroundImageUrl: state.foregroundRenderableUrl,
    resourceCache: renderResourceCache,
  }, quality ?? 0.92);

  const refreshPreview = async () => {
    if (!getOpen() || !state.previewHost || !state.previewFontsReady) return;
    const token = ++previewRenderToken;

    try {
      state.errorMessage = '';
      const previewData = buildPreviewData();
      const url = URL.createObjectURL(await renderCardPngBlob(previewData));
      if (token !== previewRenderToken || !getOpen()) {
        revokeBlobUrl(url);
        return;
      }
      replacePreviewImageUrl(url);
    } catch (error) {
      if (token !== previewRenderToken) return;
      console.error('Failed to refresh card image preview', error);
      state.errorMessage = t('editor.card_image_generate_failed');
    }
  };

  const refreshForegroundPreview = async () => {
    if (!getOpen() || !state.foregroundPreviewHost || !state.previewFontsReady) return;
    const token = ++foregroundPreviewRenderToken;

    try {
      const previewData = buildForegroundPreviewData();
      const url = URL.createObjectURL(await renderCardPngBlob(previewData));
      if (token !== foregroundPreviewRenderToken || !getOpen()) {
        revokeBlobUrl(url);
        return;
      }
      replaceForegroundPreviewImageUrl(url);
      await tick();
      requestAnimationFrame(() => {
        measureForegroundRenderBounds();
      });
    } catch (error) {
      if (token !== foregroundPreviewRenderToken) return;
      console.error('Failed to refresh foreground editor preview', error);
    }
  };

  const warmupPreviewAfterFontsReady = async () => {
    state.previewFontsReady = false;
    try {
      const fontSet = typeof document !== 'undefined'
        ? (document as Document & { fonts?: FontFaceSet }).fonts
        : undefined;
      if (fontSet?.ready) {
        await fontSet.ready;
      }
    } catch {
      // Ignore font readiness failures and still do a delayed refresh.
    }

    clearTimeout(previewWarmupTimer ?? undefined);
    previewWarmupTimer = setTimeout(() => {
      state.previewFontsReady = true;
      destroyPreview();
      void refreshPreview();
    }, 100);
  };

  const updateAutoPreviewZoom = () => {
    if (state.hasManualPreviewZoom) return;
    if (!state.previewWidth || !state.previewHeight) return;

    const nextZoomPercent = getAutoPreviewZoomPercent();
    if (state.previewZoomPercent === nextZoomPercent) return;
    state.previewZoomPercent = nextZoomPercent;
  };

  const queuePreviewRefresh = () => {
    trackCardImagePreviewDependencies(state);

    clearTimeout(previewTimer ?? undefined);
    previewTimer = setTimeout(() => {
      void refreshPreview();
    }, PREVIEW_RENDER_DEBOUNCE_MS);
  };

  const queueForegroundPreviewRefresh = () => {
    trackCardImagePreviewDependencies(state);

    clearTimeout(foregroundPreviewTimer ?? undefined);
    foregroundPreviewTimer = setTimeout(() => {
      void refreshForegroundPreview();
    }, PREVIEW_RENDER_DEBOUNCE_MS);
  };

  const clearPreviewTimer = () => {
    clearTimeout(previewTimer ?? undefined);
    previewTimer = null;
  };

  const clearForegroundPreviewTimer = () => {
    clearTimeout(foregroundPreviewTimer ?? undefined);
    foregroundPreviewTimer = null;
  };

  const exportActions = createCardImageExportActions({
    state,
    getCard,
    getCdbPath,
    onSavedJpg,
    t,
    buildPngData,
    buildJpgData,
    renderCardBlob,
  });

  const dispose = () => {
    clearTimeout(previewTimer ?? undefined);
    clearTimeout(previewZoomTimer ?? undefined);
    clearTimeout(previewWarmupTimer ?? undefined);
    clearTimeout(foregroundPreviewTimer ?? undefined);
    destroyPreview();
    destroyForegroundPreview();
    resetResourceCache();
  };

  return {
    adjustPreviewZoom,
    clearForegroundPreviewTimer,
    clearPreviewTimer,
    destroyForegroundPreview,
    destroyPreview,
    dispose,
    handleDownload: exportActions.handleDownload,
    handlePreviewWheel,
    handleSaveJpg: exportActions.handleSaveJpg,
    getPreviewImageStyle,
    queueForegroundPreviewRefresh,
    queuePreviewRefresh,
    resetResourceCache,
    updateAutoPreviewZoom,
    warmupPreviewAfterFontsReady,
  };
};
