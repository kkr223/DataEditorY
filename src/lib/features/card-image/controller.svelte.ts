import { get } from 'svelte/store';
import { _ } from 'svelte-i18n';
import type { CardDataEntry } from '$lib/types';
import type { CardImageWorkspaceSnapshot } from '$lib/types/card-image-workspace';
import { isCapabilityEnabled } from '$lib/application/capabilities/registry';
import { showToast } from '$lib/stores/toast.svelte';
import { createCardImageAiController } from './ai/controller';
import { createCardImageConfigController } from './config/controller';
import { createCardImageCropController } from './crop/controller';
import {
  DEFAULT_EXPORT_SCALE_PERCENT,
  clampExportScalePercent,
  createCardImageFormController,
} from './form/controller';
import { createCardImageForegroundController } from './foreground/controller';
import { createCardImageMediaController } from './media/controller';
import { createCardImageRenderController } from './render/controller';
import { createCardImageResizeController } from './resize/controller';
import { createCardImageSessionController } from './session/controller';
import { createCardImageInitialState } from './state';

export type { CropBox } from './crop/geometry';
export type { ColorPreset } from './form/controller';
export {
  MAX_EXPORT_SCALE_PERCENT,
  MIN_EXPORT_SCALE_PERCENT,
  NAME_COLOR_PRESETS,
} from './form/controller';
export {
  FOREGROUND_EDITOR_CARD_HEIGHT,
  FOREGROUND_EDITOR_CARD_WIDTH,
  MAX_FOREGROUND_SCALE,
  MIN_FOREGROUND_SCALE,
} from './foreground/geometry';

const CROPPED_IMAGE_SIZE = 1024;
const MAX_CROP_PREVIEW_WIDTH = 900;
const MAX_CROP_PREVIEW_HEIGHT = 680;
const MIN_CROP_SIZE = 80;
const CROP_LAYOUT_BREAKPOINT = 980;
const CROP_LAYOUT_GAP = 18;
const CROP_SIDEBAR_FALLBACK_WIDTH = 320;
const DEFAULT_PREVIEW_ZOOM_PERCENT = 108;

type CardImageControllerSource = {
  open: () => boolean;
  card: () => CardDataEntry;
  cdbPath: () => string;
  onSavedJpg: () => void | Promise<void>;
  onClose: () => void;
  getInitialSnapshot?: () => CardImageWorkspaceSnapshot | null;
};

function t(key: string, options?: Record<string, unknown>) {
  return String(get(_)(key, options as never));
}

export function createCardImageController(source: CardImageControllerSource) {
  const hasCardImageCapability = isCapabilityEnabled('card-image');
  const state = $state(createCardImageInitialState({
    maxCropPreviewWidth: MAX_CROP_PREVIEW_WIDTH,
    maxCropPreviewHeight: MAX_CROP_PREVIEW_HEIGHT,
    defaultPreviewZoomPercent: DEFAULT_PREVIEW_ZOOM_PERCENT,
    defaultExportScalePercent: DEFAULT_EXPORT_SCALE_PERCENT,
  }));

  const mediaController = createCardImageMediaController({ state });
  const formController = createCardImageFormController({
    state,
    getCard,
    t,
  });
  const cropController = createCardImageCropController({
    state,
    setCroppedImageDataUrl: (dataUrl) => {
      state.form.image = dataUrl;
    },
    revokeSourceImageUrl: mediaController.revokeSourceImageUrl,
    croppedImageSize: CROPPED_IMAGE_SIZE,
    minCropSize: MIN_CROP_SIZE,
    layoutBreakpoint: CROP_LAYOUT_BREAKPOINT,
    layoutGap: CROP_LAYOUT_GAP,
    sidebarFallbackWidth: CROP_SIDEBAR_FALLBACK_WIDTH,
    maxPreviewWidth: MAX_CROP_PREVIEW_WIDTH,
    maxPreviewHeight: MAX_CROP_PREVIEW_HEIGHT,
  });
  let foregroundController: ReturnType<typeof createCardImageForegroundController>;
  const renderController = createCardImageRenderController({
    state,
    hasExtraBuild: hasCardImageCapability,
    getOpen,
    getCard,
    getCdbPath: () => source.cdbPath(),
    onSavedJpg: () => source.onSavedJpg(),
    t,
    measureForegroundRenderBounds: () => {
      foregroundController.measureForegroundRenderBounds();
    },
  });
  const resizeController = createCardImageResizeController({
    state,
    measureForegroundRenderBounds: () => {
      foregroundController.measureForegroundRenderBounds();
    },
  });
  foregroundController = createCardImageForegroundController({
    state,
    hasExtraBuild: hasCardImageCapability,
    updateForm: formController.updateForm,
    syncForegroundRenderableUrl: mediaController.syncForegroundRenderableUrl,
    revokeForegroundRenderableUrl: mediaController.revokeForegroundRenderableUrl,
    destroyForegroundPreview: renderController.destroyForegroundPreview,
    showUploadFailed: () => {
      showToast(t('editor.card_image_foreground_upload_failed'), 'error');
    },
  });
  const sessionController = createCardImageSessionController({
    state,
    getOpen,
    getCard,
    defaultPreviewZoomPercent: DEFAULT_PREVIEW_ZOOM_PERCENT,
    defaultExportScalePercent: DEFAULT_EXPORT_SCALE_PERCENT,
    revokeSourceImageUrl: mediaController.revokeSourceImageUrl,
    revokeForegroundRenderableUrl: mediaController.revokeForegroundRenderableUrl,
    resetForegroundState: foregroundController.resetForegroundState,
    clearForegroundInitialState: foregroundController.clearForegroundInitialState,
    destroyPreview: renderController.destroyPreview,
    destroyForegroundPreview: renderController.destroyForegroundPreview,
    resetResourceCache: renderController.resetResourceCache,
    syncForegroundRenderableUrl: mediaController.syncForegroundRenderableUrl,
    warmupPreviewAfterFontsReady: renderController.warmupPreviewAfterFontsReady,
    getInitialSnapshot: () => source.getInitialSnapshot?.() ?? null,
  });
  const configController = createCardImageConfigController({
    state,
    getCard,
    t,
    defaultPreviewZoomPercent: DEFAULT_PREVIEW_ZOOM_PERCENT,
    clampExportScalePercent,
    getConfigFileName: formController.getConfigFileName,
    revokeSourceImageUrl: mediaController.revokeSourceImageUrl,
    syncForegroundRenderableUrl: mediaController.syncForegroundRenderableUrl,
    setInitialForegroundStateFromForm: foregroundController.setInitialForegroundStateFromForm,
    destroyPreview: renderController.destroyPreview,
    destroyForegroundPreview: renderController.destroyForegroundPreview,
    warmupPreviewAfterFontsReady: renderController.warmupPreviewAfterFontsReady,
  });
  const aiController = createCardImageAiController({
    state,
    getCard,
    updateForm: formController.updateForm,
    getOptionLabel: formController.getOptionLabel,
    t,
  });

  function getCard() {
    return source.card();
  }

  function getOpen() {
    return source.open();
  }

  function closeDrawer() {
    source.onClose();
  }

  function openFilePicker() {
    state.fileInput?.click();
  }

  function handleBackdropClick(event: MouseEvent) {
    if (event.currentTarget === event.target) {
      closeDrawer();
    }
  }

  $effect(() => {
    sessionController.syncDrawerState();
  });

  $effect(() => {
    sessionController.syncLanguageDefaults();
  });

  $effect(() => {
    return resizeController.observePreviewShell();
  });

  $effect(() => {
    return resizeController.observeForegroundPreviewShell();
  });

  $effect(() => {
    if (!source.open() || state.hasManualPreviewZoom) return;
    renderController.updateAutoPreviewZoom();
  });

  $effect(() => {
    if (!source.open()) return;

    renderController.queuePreviewRefresh();

    return () => {
      renderController.clearPreviewTimer();
    };
  });

  $effect(() => {
    if (!state.foregroundEditorOpen) {
      renderController.clearForegroundPreviewTimer();
      renderController.destroyForegroundPreview();
      foregroundController.stopForegroundInteraction();
      return;
    }

    renderController.queueForegroundPreviewRefresh();

    return () => {
      renderController.clearForegroundPreviewTimer();
    };
  });

  $effect(() => {
    return () => {
      renderController.dispose();
      resizeController.dispose();
      mediaController.dispose();
      foregroundController.stopForegroundInteraction();
    };
  });

  return {
    state,
    closeDrawer,
    openFilePicker,
    openConfigFilePicker: configController.openConfigFilePicker,
    openForegroundFilePicker: foregroundController.openForegroundFilePicker,
    openForegroundEditor: foregroundController.openForegroundEditor,
    handleConfigImport: configController.handleConfigImport,
    handleConfigFileUpload: configController.handleConfigFileUpload,
    handleConfigExport: configController.handleConfigExport,
    handleAiTranslate: aiController.handleAiTranslate,
    handleCropViewportResize: cropController.handleCropViewportResize,
    handleImageUpload: cropController.handleImageUpload,
    handleForegroundImageUpload: foregroundController.handleForegroundImageUpload,
    applyCrop: cropController.applyCrop,
    cancelCrop: cropController.cancelCrop,
    handleCropPointerDown: cropController.handleCropPointerDown,
    handleCropResizePointerDown: cropController.handleCropResizePointerDown,
    handleCropPointerMove: cropController.handleCropPointerMove,
    handleCropPointerUp: cropController.handleCropPointerUp,
    handleCropWheel: cropController.handleCropWheel,
    rotateCropPreview: cropController.rotateCropPreview,
    resetCropRotation: cropController.resetCropRotation,
    handleCropRotationInput: cropController.handleCropRotationInput,
    handleCropRotationNumberInput: cropController.handleCropRotationNumberInput,
    handleCropRotationNumberBlur: cropController.handleCropRotationNumberBlur,
    getCropStageMetrics: cropController.getCropStageMetrics,
    adjustPreviewZoom: renderController.adjustPreviewZoom,
    handlePreviewWheel: renderController.handlePreviewWheel,
    clearCustomNameColor: formController.clearCustomNameColor,
    clearCustomNameShadowColor: formController.clearCustomNameShadowColor,
    applyNameColorPreset: formController.applyNameColorPreset,
    isNameColorPresetActive: formController.isNameColorPresetActive,
    applyNameShadowColorPreset: formController.applyNameShadowColorPreset,
    isNameShadowColorPresetActive: formController.isNameShadowColorPresetActive,
    updateForm: formController.updateForm,
    getOptionLabel: formController.getOptionLabel,
    getPreviewImageStyle: renderController.getPreviewImageStyle,
    resetForegroundTransform: foregroundController.resetForegroundTransform,
    clearForegroundImage: foregroundController.clearForegroundImage,
    hasForegroundImage: foregroundController.hasForegroundImage,
    getForegroundEditorScale: foregroundController.getForegroundEditorScale,
    getForegroundSelectionStyle: foregroundController.getForegroundSelectionStyle,
    handleForegroundMovePointerDown: foregroundController.handleForegroundMovePointerDown,
    handleForegroundScalePointerDown: foregroundController.handleForegroundScalePointerDown,
    handleForegroundRotatePointerDown: foregroundController.handleForegroundRotatePointerDown,
    handleDownload: renderController.handleDownload,
    handleSaveJpg: renderController.handleSaveJpg,
    handleBackdropClick,
    closeForegroundEditor: foregroundController.closeForegroundEditor,
    handleForegroundBackdropClick: foregroundController.handleForegroundBackdropClick,
  };
}
