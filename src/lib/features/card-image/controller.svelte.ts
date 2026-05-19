import { tick } from 'svelte';
import { get } from 'svelte/store';
import { _ } from 'svelte-i18n';
import type { CardDataEntry } from '$lib/types';
import { HAS_AI_FEATURE, HAS_EXTRA_BUILD } from '$lib/config/build';
import { showToast } from '$lib/stores/toast.svelte';
import { tauriBridge } from '$lib/infrastructure/tauri';
import { pathExists, readTextFile, writeBinaryFile, writeTextFile } from '$lib/infrastructure/tauri/commands';
import { createAiAppContext } from '$lib/services/aiAppContext';
import { getPicsDir } from '$lib/services/cardImageService';
import {
  CARD_IMAGE_LANGUAGE_OPTIONS,
  createCardImageFormData,
  getCardImageLocaleDefaults,
  normalizeCardImageFormData,
  parseCardImageConfigDocument,
  serializeCardImageConfigDocument,
  type CardImageFormData,
  type CardImageLanguage,
} from './layout';
import { writeErrorLog } from '$lib/utils/errorLog';
import {
  calculateCropStageMetrics,
  clampCropBoxToStage,
  createCenteredCropBox,
  moveCropBox,
  normalizeCropRotation,
  radiansFromDegrees,
  recenterCropBox,
  resizeCropBox,
  resizeCropBoxAroundCenter,
  type CropBox,
} from './crop/geometry';
import {
  calculateForegroundEditorScale,
  calculateForegroundRenderBounds,
  calculatePointerAngle,
  calculatePointerDistance,
  createEmptyForegroundState,
  createForegroundInitialStateFromForm,
  createForegroundSelectionStyle,
  createForegroundUploadInitialState,
  FOREGROUND_EDITOR_CARD_HEIGHT,
  FOREGROUND_EDITOR_CARD_WIDTH,
  hasForegroundImage as hasForegroundImageData,
  moveForegroundFromDrag,
  rotateForegroundFromDrag,
  scaleForegroundFromDrag,
  type ForegroundEditorMode,
  type ForegroundInitialState,
} from './foreground/geometry';
import {
  blobToUint8Array,
  createCardRenderResourceCache,
  createForegroundPreviewRenderData,
  createJpgRenderData,
  createPngRenderData,
  createPreviewRenderData,
  dataUrlToBlob,
  isFieldSpellRenderData,
  renderCardBlob as renderCardBlobForCard,
  renderCardPngBlob as renderCardPngBlobForCard,
  renderSquareJpgBlob,
  type CardRenderResourceCache,
} from './render';

export type { CropBox } from './crop/geometry';
export {
  FOREGROUND_EDITOR_CARD_HEIGHT,
  FOREGROUND_EDITOR_CARD_WIDTH,
  MAX_FOREGROUND_SCALE,
  MIN_FOREGROUND_SCALE,
} from './foreground/geometry';
type DragMode = 'move' | 'resize' | null;
type LabelOption = { value: string; label?: string; labelKey?: string };
export type ColorPreset = { value: string; labelKey: string };

const CARD_WIDTH = FOREGROUND_EDITOR_CARD_WIDTH;
const CARD_HEIGHT = FOREGROUND_EDITOR_CARD_HEIGHT;
const CROPPED_IMAGE_SIZE = 1024;
const MAX_CROP_PREVIEW_WIDTH = 900;
const MAX_CROP_PREVIEW_HEIGHT = 680;
const FIELD_SPELL_ART_SIZE = 512;
const MIN_CROP_SIZE = 80;
const CROP_LAYOUT_BREAKPOINT = 980;
const CROP_LAYOUT_GAP = 18;
const CROP_SIDEBAR_FALLBACK_WIDTH = 320;
export const MIN_EXPORT_SCALE_PERCENT = 10;
export const MAX_EXPORT_SCALE_PERCENT = 100;
const DEFAULT_EXPORT_SCALE_PERCENT = 43;
const MIN_PREVIEW_ZOOM_PERCENT = 60;
const MAX_PREVIEW_ZOOM_PERCENT = 170;
const DEFAULT_PREVIEW_ZOOM_PERCENT = 108;
const PREVIEW_ZOOM_REFERENCE_WIDTH = 560;
const PREVIEW_ZOOM_REFERENCE_HEIGHT = 800;
const PREVIEW_RENDER_DEBOUNCE_MS = 160;
export const NAME_COLOR_PRESETS: ColorPreset[] = [
  { value: '#ffffff', labelKey: 'editor.card_image_color_preset_white' },
  { value: '#d8dee9', labelKey: 'editor.card_image_color_preset_silver' },
  { value: '#f3c969', labelKey: 'editor.card_image_color_preset_gold' },
  { value: '#1f2937', labelKey: 'editor.card_image_color_preset_black' },
  { value: '#ef4444', labelKey: 'editor.card_image_color_preset_red' },
  { value: '#60a5fa', labelKey: 'editor.card_image_color_preset_blue' },
  { value: '#34d399', labelKey: 'editor.card_image_color_preset_green' },
  { value: '#c084fc', labelKey: 'editor.card_image_color_preset_purple' },
];

type CardImageControllerSource = {
  open: () => boolean;
  card: () => CardDataEntry;
  cdbPath: () => string;
  onSavedJpg: () => void | Promise<void>;
  onClose: () => void;
};

function t(key: string, options?: Record<string, unknown>) {
  return String(get(_)(key, options as never));
}

export function createCardImageController(source: CardImageControllerSource) {
  const state = $state({
    form: normalizeCardImageFormData({}),
    previewHost: null as HTMLDivElement | null,
    previewShell: null as HTMLDivElement | null,
    previewImageUrl: '',
    fileInput: null as HTMLInputElement | null,
    configFileInput: null as HTMLInputElement | null,
    foregroundFileInput: null as HTMLInputElement | null,
    foregroundEditorOpen: false,
    foregroundPreviewHost: null as HTMLDivElement | null,
    foregroundPreviewShell: null as HTMLDivElement | null,
    foregroundPreviewImageUrl: '',
    foregroundRenderableUrl: '',
    croppedImageDataUrl: '',
    sourceImageUrl: '',
    sourceImageWidth: 0,
    sourceImageHeight: 0,
    cropBodyElement: null as HTMLDivElement | null,
    cropSidebarElement: null as HTMLElement | null,
    cropModalOpen: false,
    cropRotation: 0,
    cropBox: { x: 0, y: 0, size: 0 } as CropBox,
    dragMode: null as DragMode,
    dragPointerId: null as number | null,
    dragStartX: 0,
    dragStartY: 0,
    dragStartBox: { x: 0, y: 0, size: 0 } as CropBox,
    cropViewportWidth: typeof window === 'undefined' ? MAX_CROP_PREVIEW_WIDTH : window.innerWidth,
    cropViewportHeight: typeof window === 'undefined' ? MAX_CROP_PREVIEW_HEIGHT : window.innerHeight,
    previewWidth: 360,
    previewHeight: 640,
    foregroundPreviewWidth: 420,
    foregroundPreviewHeight: 680,
    foregroundRenderWidth: FOREGROUND_EDITOR_CARD_WIDTH,
    foregroundRenderHeight: FOREGROUND_EDITOR_CARD_HEIGHT,
    foregroundRenderOffsetX: 0,
    foregroundRenderOffsetY: 0,
    previewZoomPercent: DEFAULT_PREVIEW_ZOOM_PERCENT,
    hasManualPreviewZoom: false,
    exportScalePercent: DEFAULT_EXPORT_SCALE_PERCENT,
    isDownloading: false,
    isSavingJpg: false,
    isTranslating: false,
    errorMessage: '',
    lastFormLanguage: 'sc' as CardImageLanguage,
    previewFontsReady: false,
    foregroundDragMode: null as ForegroundEditorMode,
    foregroundDragPointerId: null as number | null,
    foregroundDragStartX: 0,
    foregroundDragStartY: 0,
    foregroundDragStartForegroundX: 0,
    foregroundDragStartForegroundY: 0,
    foregroundDragStartForegroundScale: 1,
    foregroundDragStartForegroundRotation: 0,
    foregroundDragStartAngle: 0,
    foregroundDragStartDistance: 1,
    foregroundDragCenterClientX: 0,
    foregroundDragCenterClientY: 0,
    initialForegroundState: null as ForegroundInitialState | null,
  });

  let lastHydrationKey = '';
  let previewTimer: ReturnType<typeof setTimeout> | null = null;
  let previewWarmupTimer: ReturnType<typeof setTimeout> | null = null;
  let foregroundPreviewTimer: ReturnType<typeof setTimeout> | null = null;
  let foregroundResizeObserver: ResizeObserver | null = null;
  let previewResizeObserver: ResizeObserver | null = null;
  let previewRenderToken = 0;
  let foregroundPreviewRenderToken = 0;
  let renderResourceCache: CardRenderResourceCache = createCardRenderResourceCache();

  function getCard() {
    return source.card();
  }

  function getOpen() {
    return source.open();
  }

  function revokeBlobUrl(url: string) {
    if (url.startsWith('blob:')) {
      URL.revokeObjectURL(url);
    }
  }

  function replacePreviewImageUrl(url: string) {
    if (state.previewImageUrl !== url) {
      revokeBlobUrl(state.previewImageUrl);
    }
    state.previewImageUrl = url;
  }

  function replaceForegroundPreviewImageUrl(url: string) {
    if (state.foregroundPreviewImageUrl !== url) {
      revokeBlobUrl(state.foregroundPreviewImageUrl);
    }
    state.foregroundPreviewImageUrl = url;
  }

  function destroyPreview() {
    previewRenderToken += 1;
    replacePreviewImageUrl('');
  }

  function resetRenderResourceCache() {
    const currentCache = renderResourceCache;
    renderResourceCache = createCardRenderResourceCache();
    void currentCache.releaseAll();
  }

  function destroyForegroundPreview() {
    foregroundPreviewRenderToken += 1;
    replaceForegroundPreviewImageUrl('');
  }

  function revokeSourceImageUrl() {
    if (state.sourceImageUrl) {
      URL.revokeObjectURL(state.sourceImageUrl);
      state.sourceImageUrl = '';
    }
  }

  function revokeForegroundRenderableUrl() {
    if (state.foregroundRenderableUrl.startsWith('blob:')) {
      URL.revokeObjectURL(state.foregroundRenderableUrl);
    }
    state.foregroundRenderableUrl = '';
  }

  async function syncForegroundRenderableUrl(url: string) {
    revokeForegroundRenderableUrl();
    const nextUrl = url.trim();
    if (!nextUrl) {
      return;
    }

    if (nextUrl.startsWith('data:')) {
      const blob = dataUrlToBlob(nextUrl);
      state.foregroundRenderableUrl = URL.createObjectURL(blob);
      return;
    }

    state.foregroundRenderableUrl = nextUrl;
  }

  function closeDrawer() {
    source.onClose();
  }

  function isPositiveCardCode(value: unknown) {
    return Number.isInteger(Number(value)) && Number(value) > 0;
  }

  function updateForm(patch: Partial<CardImageFormData>) {
    state.form = normalizeCardImageFormData({
      ...state.form,
      ...patch,
    });
  }

  function resetImageState() {
    state.croppedImageDataUrl = '';
    state.sourceImageWidth = 0;
    state.sourceImageHeight = 0;
    state.cropModalOpen = false;
    state.cropRotation = 0;
    state.cropBox = { x: 0, y: 0, size: 0 };
    state.dragMode = null;
    state.dragPointerId = null;
    state.hasManualPreviewZoom = false;
    state.previewZoomPercent = DEFAULT_PREVIEW_ZOOM_PERCENT;
    state.exportScalePercent = DEFAULT_EXPORT_SCALE_PERCENT;
    revokeSourceImageUrl();
  }

  function resetForegroundState() {
    state.foregroundEditorOpen = false;
    state.foregroundDragMode = null;
    state.foregroundDragPointerId = null;
  }

  function clearForegroundInitialState() {
    state.initialForegroundState = null;
  }

  function openFilePicker() {
    state.fileInput?.click();
  }

  function openConfigFilePicker() {
    state.configFileInput?.click();
  }

  function openForegroundFilePicker() {
    if (!HAS_EXTRA_BUILD) return;
    state.foregroundFileInput?.click();
  }

  function openForegroundEditor() {
    if (!HAS_EXTRA_BUILD) return;
    state.foregroundEditorOpen = true;
  }

  function getForegroundEditorScale() {
    return calculateForegroundEditorScale({
      previewWidth: state.foregroundPreviewWidth,
      previewHeight: state.foregroundPreviewHeight,
    });
  }

  function hasForegroundImage() {
    return hasForegroundImageData(state.form);
  }

  function getForegroundSelectionStyle() {
    return createForegroundSelectionStyle({
      data: state.form,
      bounds: {
        width: state.foregroundRenderWidth,
        height: state.foregroundRenderHeight,
        offsetX: state.foregroundRenderOffsetX,
        offsetY: state.foregroundRenderOffsetY,
      },
    });
  }

  function resetForegroundTransform() {
    if (!hasForegroundImage() || !state.initialForegroundState) return;

    updateForm({
      foregroundWidth: state.initialForegroundState.foregroundWidth,
      foregroundHeight: state.initialForegroundState.foregroundHeight,
      foregroundX: state.initialForegroundState.foregroundX,
      foregroundY: state.initialForegroundState.foregroundY,
      foregroundScale: state.initialForegroundState.foregroundScale,
      foregroundRotation: state.initialForegroundState.foregroundRotation,
    });
  }

  function clearForegroundImage() {
    clearForegroundInitialState();
    revokeForegroundRenderableUrl();
    updateForm({
      foregroundImage: '',
      ...createEmptyForegroundState(),
    });
  }

  function clearCustomNameColor() {
    updateForm({
      color: '',
      gradient: false,
      gradientColor1: '#999999',
      gradientColor2: '#ffffff',
    });
  }

  function clearCustomNameShadowColor() {
    updateForm({
      nameShadowColor: '',
      nameShadowGradient: false,
      nameShadowGradientColor1: '#1f2937',
      nameShadowGradientColor2: '#0f172a',
    });
  }

  function normalizeColorValue(value: string) {
    return value.trim().toLowerCase();
  }

  function applyNameColorPreset(color: string) {
    updateForm({
      color,
      gradientColor1: color,
      gradientColor2: color,
    });
  }

  function isNameColorPresetActive(color: string) {
    return normalizeColorValue(state.form.color) === normalizeColorValue(color);
  }

  function applyNameShadowColorPreset(color: string) {
    updateForm({
      nameShadowColor: color,
      nameShadowGradientColor1: color,
      nameShadowGradientColor2: color,
    });
  }

  function isNameShadowColorPresetActive(color: string) {
    return normalizeColorValue(state.form.nameShadowColor) === normalizeColorValue(color);
  }

  function getOptionLabel(option: LabelOption) {
    if (option.labelKey) return t(option.labelKey);
    return option.label ?? option.value;
  }

  function clampExportScalePercent(value: number) {
    return Math.max(MIN_EXPORT_SCALE_PERCENT, Math.min(MAX_EXPORT_SCALE_PERCENT, Math.round(value)));
  }

  function getConfigFileName() {
    const card = getCard();
    const code = String(state.form.password || card.code || 'card-image').trim() || 'card-image';
    return `${code}-card-image.json`;
  }

  async function applyImportedConfigContent(content: string, sourceLabel: string) {
    const card = getCard();
    try {
      const parsed = parseCardImageConfigDocument(content);
      const importedForm = parsed.form;

      revokeSourceImageUrl();
      state.sourceImageWidth = 0;
      state.sourceImageHeight = 0;
      state.cropModalOpen = false;
      state.cropRotation = 0;
      state.cropBox = { x: 0, y: 0, size: 0 };
      state.dragMode = null;
      state.dragPointerId = null;
      state.croppedImageDataUrl = importedForm.image || '';
      state.hasManualPreviewZoom = false;
      state.previewZoomPercent = DEFAULT_PREVIEW_ZOOM_PERCENT;
      if (parsed.exportScalePercent !== null) {
        state.exportScalePercent = clampExportScalePercent(parsed.exportScalePercent);
      }

      state.form = importedForm;
      state.lastFormLanguage = importedForm.language as CardImageLanguage;
      state.initialForegroundState = createForegroundInitialStateFromForm(importedForm);
      await syncForegroundRenderableUrl(importedForm.foregroundImage || '');
      destroyPreview();
      destroyForegroundPreview();
      await warmupPreviewAfterFontsReady();
      showToast(t('editor.card_image_config_import_success'), 'success');
    } catch (error) {
      console.error('Failed to import card image config', error);
      void writeErrorLog({
        source: 'card-image.config.import',
        error,
        extra: {
          cardCode: card.code ?? 0,
          source: sourceLabel,
        },
      });
      showToast(t('editor.card_image_config_import_failed'), 'error');
    }
  }

  async function handleConfigImport() {
    if (!tauriBridge.isTauri()) {
      openConfigFilePicker();
      return;
    }

    const selected = await tauriBridge.open({
      multiple: false,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (!selected || typeof selected !== 'string') return;
    try {
      const content = await readTextFile(selected);
      await applyImportedConfigContent(content, selected);
    } catch (error) {
      const card = getCard();
      console.error('Failed to read card image config', error);
      void writeErrorLog({
        source: 'card-image.config.read',
        error,
        extra: {
          cardCode: card.code ?? 0,
          source: selected,
        },
      });
      showToast(t('editor.card_image_config_import_failed'), 'error');
    }
  }

  async function handleConfigFileUpload(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      await applyImportedConfigContent(content, file.name);
    } finally {
      input.value = '';
    }
  }

  async function handleConfigExport() {
    const card = getCard();
    try {
      const content = serializeCardImageConfigDocument({
        form: state.form,
        exportScalePercent: state.exportScalePercent,
        cardCode: Number(card.code ?? 0),
        cardName: card.name ?? '',
      });

      if (tauriBridge.isTauri()) {
        const targetPath = await tauriBridge.save({
          defaultPath: getConfigFileName(),
          filters: [{ name: 'JSON', extensions: ['json'] }],
        });
        if (!targetPath) return;
        await writeTextFile(targetPath, content);
      } else {
        const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = getConfigFileName();
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 0);
      }

      showToast(t('editor.card_image_config_export_success'), 'success');
    } catch (error) {
      console.error('Failed to export card image config', error);
      void writeErrorLog({
        source: 'card-image.config.export',
        error,
        extra: {
          cardCode: card.code ?? 0,
        },
      });
      showToast(t('editor.card_image_config_export_failed'), 'error');
    }
  }

  async function ensureAiReady() {
    if (!HAS_AI_FEATURE) {
      return false;
    }

    try {
      await createAiAppContext().getAiConfig();
      return true;
    } catch {
      await tauriBridge.message(t('editor.ai_requires_secret_key'), {
        title: t('editor.ai_requires_secret_key_title'),
        kind: 'warning',
      });
      return false;
    }
  }

  async function handleAiTranslate() {
    const card = getCard();
    if (!(await ensureAiReady())) return;

    if (!state.form.name.trim() && !state.form.monsterType.trim() && !state.form.description.trim() && !state.form.pendulumDescription.trim()) {
      showToast(t('editor.card_image_ai_translate_empty'), 'info');
      return;
    }

    try {
      state.isTranslating = true;
      const { translateCardImageFields } = await import('$lib/utils/ai');
      const targetLanguageLabel = getOptionLabel(
        CARD_IMAGE_LANGUAGE_OPTIONS.find((option) => option.value === state.form.language) ?? {
          value: state.form.language,
          label: state.form.language,
        },
      );
      const translated = await translateCardImageFields({
        context: createAiAppContext(),
        currentCard: card,
        targetLanguage: targetLanguageLabel,
        name: state.form.name,
        monsterType: state.form.monsterType,
        description: state.form.description,
        pendulumDescription: state.form.pendulumDescription,
      });

      updateForm({
        name: translated.name ?? state.form.name,
        monsterType: translated.monsterType ?? state.form.monsterType,
        description: translated.description ?? state.form.description,
        pendulumDescription: translated.pendulumDescription ?? state.form.pendulumDescription,
      });
      showToast(t('editor.card_image_ai_translate_success'), 'success');
    } catch (error) {
      console.error('Failed to translate card image fields', error);
      void writeErrorLog({
        source: 'card-image.ai.translate',
        error,
        extra: {
          cardCode: card.code ?? 0,
          targetLanguage: state.form.language,
        },
      });
      showToast(t('editor.card_image_ai_translate_failed'), 'error');
    } finally {
      state.isTranslating = false;
    }
  }

  function getCropRotationRadians() {
    return radiansFromDegrees(state.cropRotation);
  }

  function getCropStageMetrics() {
    return calculateCropStageMetrics({
      sourceImageWidth: state.sourceImageWidth,
      sourceImageHeight: state.sourceImageHeight,
      rotation: state.cropRotation,
      viewportWidth: state.cropViewportWidth,
      viewportHeight: state.cropViewportHeight,
      bodyWidth: state.cropBodyElement?.clientWidth ?? 0,
      sidebarWidth: state.cropSidebarElement?.clientWidth ?? CROP_SIDEBAR_FALLBACK_WIDTH,
      minCropSize: MIN_CROP_SIZE,
      layoutBreakpoint: CROP_LAYOUT_BREAKPOINT,
      layoutGap: CROP_LAYOUT_GAP,
      maxPreviewWidth: MAX_CROP_PREVIEW_WIDTH,
      maxPreviewHeight: MAX_CROP_PREVIEW_HEIGHT,
    });
  }

  function clampCropBox(nextBox: CropBox): CropBox {
    return clampCropBoxToStage(nextBox, getCropStageMetrics(), MIN_CROP_SIZE);
  }

  function initializeCropBox() {
    const nextBox = createCenteredCropBox(getCropStageMetrics(), MIN_CROP_SIZE);
    if (!nextBox) return;
    state.cropBox = nextBox;
  }

  function setCropRotation(nextRotation: number) {
    const next = normalizeCropRotation(nextRotation);
    if (next === state.cropRotation) return;

    const size = state.cropBox.size;

    state.cropRotation = next;
    state.cropBox = size
      ? recenterCropBox(state.cropBox, getCropStageMetrics(), MIN_CROP_SIZE)
      : state.cropBox;
  }

  function rotateCropPreview(delta: number) {
    setCropRotation(state.cropRotation + delta);
  }

  function resetCropRotation() {
    setCropRotation(0);
  }

  function handleCropRotationInput(event: Event) {
    setCropRotation(Number((event.currentTarget as HTMLInputElement).value));
  }

  function handleCropRotationNumberInput(value: string) {
    const trimmed = value.trim();
    if (!trimmed || trimmed === '-' || trimmed === '.' || trimmed === '-.') {
      return;
    }

    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      return;
    }

    setCropRotation(parsed);
  }

  function handleCropRotationNumberBlur() {
    setCropRotation(state.cropRotation);
  }

  function handleCropViewportResize() {
    if (typeof window === 'undefined') return;
    state.cropViewportWidth = window.innerWidth;
    state.cropViewportHeight = window.innerHeight;
    if (!state.cropModalOpen) return;
    if (!state.cropBox.size) {
      initializeCropBox();
      return;
    }

    state.cropBox = recenterCropBox(state.cropBox, getCropStageMetrics(), MIN_CROP_SIZE);
  }

  async function handleImageUpload(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    revokeSourceImageUrl();
    state.sourceImageUrl = URL.createObjectURL(file);

    const image = new Image();
    image.src = state.sourceImageUrl;
    await image.decode();
    state.sourceImageWidth = image.naturalWidth;
    state.sourceImageHeight = image.naturalHeight;
    state.cropRotation = 0;
    state.cropModalOpen = true;

    await tick();
    requestAnimationFrame(() => {
      initializeCropBox();
    });

    input.value = '';
  }

  async function readFileAsDataUrl(file: File) {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(reader.error ?? new Error('File read failed'));
      reader.readAsDataURL(file);
    });

    const image = new Image();
    image.src = dataUrl;
    await image.decode();

    return {
      dataUrl,
      width: image.naturalWidth,
      height: image.naturalHeight,
    };
  }

  async function trimTransparentImage(dataUrl: string) {
    const image = new Image();
    image.src = dataUrl;
    await image.decode();

    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      return {
        dataUrl,
        width: image.naturalWidth,
        height: image.naturalHeight,
      };
    }

    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;

    let minX = canvas.width;
    let minY = canvas.height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const alpha = pixels[(y * canvas.width + x) * 4 + 3];
        if (alpha <= 0) continue;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }

    if (maxX < minX || maxY < minY) {
      return {
        dataUrl,
        width: image.naturalWidth,
        height: image.naturalHeight,
      };
    }

    const trimmedWidth = maxX - minX + 1;
    const trimmedHeight = maxY - minY + 1;
    if (trimmedWidth === canvas.width && trimmedHeight === canvas.height) {
      return {
        dataUrl,
        width: image.naturalWidth,
        height: image.naturalHeight,
      };
    }

    const trimmedCanvas = document.createElement('canvas');
    trimmedCanvas.width = trimmedWidth;
    trimmedCanvas.height = trimmedHeight;
    const trimmedContext = trimmedCanvas.getContext('2d');
    if (!trimmedContext) {
      return {
        dataUrl,
        width: image.naturalWidth,
        height: image.naturalHeight,
      };
    }

    trimmedContext.drawImage(
      image,
      minX,
      minY,
      trimmedWidth,
      trimmedHeight,
      0,
      0,
      trimmedWidth,
      trimmedHeight,
    );

    return {
      dataUrl: trimmedCanvas.toDataURL('image/png'),
      width: trimmedWidth,
      height: trimmedHeight,
    };
  }

  async function handleForegroundImageUpload(event: Event) {
    if (!HAS_EXTRA_BUILD) return;
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const uploaded = await trimTransparentImage((await readFileAsDataUrl(file)).dataUrl);
      const isReplacing = hasForegroundImage();
      const nextInitialState = createForegroundUploadInitialState({
        width: uploaded.width,
        height: uploaded.height,
        isReplacing,
        currentState: state.form,
      });
      state.initialForegroundState = nextInitialState;
      await syncForegroundRenderableUrl(uploaded.dataUrl);
      updateForm({
        foregroundImage: uploaded.dataUrl,
        ...nextInitialState,
      });
    } catch (error) {
      console.error('Failed to upload foreground image', error);
      showToast(t('editor.card_image_foreground_upload_failed'), 'error');
    } finally {
      input.value = '';
    }
  }

  async function applyCrop() {
    if (!state.sourceImageUrl || !state.sourceImageWidth || !state.sourceImageHeight) return;

    const metrics = getCropStageMetrics();
    if (!metrics.stageWidth || !metrics.stageHeight) return;

    const canvas = document.createElement('canvas');
    canvas.width = CROPPED_IMAGE_SIZE;
    canvas.height = CROPPED_IMAGE_SIZE;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas context unavailable');
    }

    const image = new Image();
    image.src = state.sourceImageUrl;
    await image.decode();

    const stageCanvas = document.createElement('canvas');
    stageCanvas.width = metrics.renderWidth;
    stageCanvas.height = metrics.renderHeight;
    const stageContext = stageCanvas.getContext('2d');
    if (!stageContext) {
      throw new Error('Stage canvas context unavailable');
    }

    stageContext.imageSmoothingEnabled = true;
    stageContext.imageSmoothingQuality = 'high';
    stageContext.clearRect(0, 0, stageCanvas.width, stageCanvas.height);
    stageContext.save();
    stageContext.translate(stageCanvas.width / 2, stageCanvas.height / 2);
    stageContext.rotate(getCropRotationRadians());
    stageContext.drawImage(image, -state.sourceImageWidth / 2, -state.sourceImageHeight / 2, state.sourceImageWidth, state.sourceImageHeight);
    stageContext.restore();

    const scaleX = stageCanvas.width / metrics.stageWidth;
    const scaleY = stageCanvas.height / metrics.stageHeight;
    context.clearRect(0, 0, CROPPED_IMAGE_SIZE, CROPPED_IMAGE_SIZE);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(
      stageCanvas,
      state.cropBox.x * scaleX,
      state.cropBox.y * scaleY,
      state.cropBox.size * scaleX,
      state.cropBox.size * scaleY,
      0,
      0,
      CROPPED_IMAGE_SIZE,
      CROPPED_IMAGE_SIZE,
    );

    state.croppedImageDataUrl = canvas.toDataURL('image/png');
    state.form.image = state.croppedImageDataUrl;
    state.cropModalOpen = false;
  }

  function cancelCrop() {
    if (!state.croppedImageDataUrl) {
      revokeSourceImageUrl();
      state.sourceImageWidth = 0;
      state.sourceImageHeight = 0;
    }
    state.cropModalOpen = false;
    state.cropRotation = 0;
    state.dragMode = null;
    state.dragPointerId = null;
  }

  function handleCropPointerDown(event: PointerEvent) {
    state.dragMode = 'move';
    state.dragPointerId = event.pointerId;
    state.dragStartX = event.clientX;
    state.dragStartY = event.clientY;
    state.dragStartBox = { ...state.cropBox };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function handleCropResizePointerDown(event: PointerEvent) {
    event.stopPropagation();
    state.dragMode = 'resize';
    state.dragPointerId = event.pointerId;
    state.dragStartX = event.clientX;
    state.dragStartY = event.clientY;
    state.dragStartBox = { ...state.cropBox };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function handleCropPointerMove(event: PointerEvent) {
    if (!state.dragMode || state.dragPointerId !== event.pointerId) return;

    const dx = event.clientX - state.dragStartX;
    const dy = event.clientY - state.dragStartY;

    if (state.dragMode === 'move') {
      state.cropBox = moveCropBox(state.dragStartBox, dx, dy, getCropStageMetrics(), MIN_CROP_SIZE);
      return;
    }

    state.cropBox = resizeCropBox(state.dragStartBox, Math.max(dx, dy), getCropStageMetrics(), MIN_CROP_SIZE);
  }

  function handleCropPointerUp(event: PointerEvent) {
    if (state.dragPointerId !== event.pointerId) return;
    state.dragMode = null;
    state.dragPointerId = null;
  }

  function handleCropWheel(event: WheelEvent) {
    event.preventDefault();
    const delta = Math.sign(event.deltaY) * 20;
    state.cropBox = resizeCropBoxAroundCenter(state.cropBox, delta, getCropStageMetrics(), MIN_CROP_SIZE);
  }

  function getAutoPreviewZoomPercent() {
    if (!state.previewWidth || !state.previewHeight) {
      return DEFAULT_PREVIEW_ZOOM_PERCENT;
    }

    const widthRatio = state.previewWidth / PREVIEW_ZOOM_REFERENCE_WIDTH;
    const heightRatio = state.previewHeight / PREVIEW_ZOOM_REFERENCE_HEIGHT;
    const scaledPercent = Math.min(widthRatio, heightRatio) * 100;

    return Math.round(
      Math.max(DEFAULT_PREVIEW_ZOOM_PERCENT, Math.min(MAX_PREVIEW_ZOOM_PERCENT, scaledPercent)),
    );
  }

  function getPreviewScale() {
    const availableWidth = Math.max(state.previewWidth - 16, 1);
    const availableHeight = Math.max(state.previewHeight - 40, 1);
    const baseScale = Math.min(availableWidth / CARD_WIDTH, availableHeight / CARD_HEIGHT);
    return Math.max(baseScale * (state.previewZoomPercent / 100), 0.02);
  }

  function adjustPreviewZoom(delta: number) {
    state.hasManualPreviewZoom = true;
    state.previewZoomPercent = Math.max(
      MIN_PREVIEW_ZOOM_PERCENT,
      Math.min(MAX_PREVIEW_ZOOM_PERCENT, state.previewZoomPercent + delta),
    );
  }

  function buildPreviewData(): CardImageFormData {
    return createPreviewRenderData({
      form: state.form,
      croppedImageDataUrl: state.croppedImageDataUrl,
    }, getPreviewScale(), { hasExtraBuild: HAS_EXTRA_BUILD });
  }

  function buildJpgData(): CardImageFormData {
    return createJpgRenderData({
      form: state.form,
      croppedImageDataUrl: state.croppedImageDataUrl,
    }, state.exportScalePercent, { hasExtraBuild: HAS_EXTRA_BUILD });
  }

  function buildPngData(): CardImageFormData {
    return createPngRenderData({
      form: state.form,
      croppedImageDataUrl: state.croppedImageDataUrl,
    }, { hasExtraBuild: HAS_EXTRA_BUILD });
  }

  function buildForegroundPreviewData(): CardImageFormData {
    return createForegroundPreviewRenderData({
      form: state.form,
      croppedImageDataUrl: state.croppedImageDataUrl,
    });
  }

  function handlePreviewWheel(event: WheelEvent) {
    event.preventDefault();
    const stepSize = event.ctrlKey || event.metaKey ? 8 : 5;
    const step = event.deltaY < 0 ? stepSize : -stepSize;
    adjustPreviewZoom(step);
  }

  function trackPreviewDependencies() {
    void state.form.language;
    void state.form.font;
    void state.form.name;
    void state.form.color;
    void state.form.align;
    void state.form.gradient;
    void state.form.gradientColor1;
    void state.form.gradientColor2;
    void state.form.type;
    void state.form.attribute;
    void state.form.icon;
    void state.form.cardType;
    void state.form.pendulumType;
    void state.form.level;
    void state.form.rank;
    void state.form.pendulumScale;
    void state.form.pendulumDescription;
    void state.form.monsterType;
    void state.form.atkBar;
    void state.form.atk;
    void state.form.def;
    void state.form.arrowList.length;
    void state.form.description;
    void state.form.firstLineCompress;
    void state.form.descriptionAlign;
    void state.form.descriptionZoom;
    void state.form.descriptionWeight;
    void state.form.package;
    void state.form.password;
    void state.form.copyright;
    void state.form.laser;
    void state.form.rare;
    void state.form.twentieth;
    void state.form.radius;
    void state.form.foregroundImage;
    void state.form.foregroundWidth;
    void state.form.foregroundHeight;
    void state.form.foregroundX;
    void state.form.foregroundY;
    void state.form.foregroundScale;
    void state.form.foregroundRotation;
    void state.form.effectBlockEnabled;
    void state.form.effectBlockX;
    void state.form.effectBlockY;
    void state.form.effectBlockWidth;
    void state.form.effectBlockHeight;
    void state.form.effectBlockColor;
    void state.form.effectBlockOpacity;
    void state.form.nameShadowColor;
    void state.form.nameShadowGradient;
    void state.form.nameShadowGradientColor1;
    void state.form.nameShadowGradientColor2;
    void state.croppedImageDataUrl;
    void state.previewWidth;
    void state.previewHeight;
    void state.previewZoomPercent;
    void state.foregroundPreviewWidth;
    void state.foregroundPreviewHeight;
    void state.foregroundRenderWidth;
    void state.foregroundRenderHeight;
    void state.foregroundRenderOffsetX;
    void state.foregroundRenderOffsetY;
  }

  async function renderCardPngBlob(data: CardImageFormData) {
    return renderCardPngBlobForCard(getCard(), data, {
      foregroundImageUrl: state.foregroundRenderableUrl,
      resourceCache: renderResourceCache,
    });
  }

  async function renderCardBlob(
    data: CardImageFormData,
    type: 'png' | 'jpg',
    quality?: number,
  ) {
    return renderCardBlobForCard(getCard(), data, type, {
      foregroundImageUrl: state.foregroundRenderableUrl,
      resourceCache: renderResourceCache,
    }, quality ?? 0.92);
  }

  async function refreshPreview() {
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
  }

  async function refreshForegroundPreview() {
    if (!getOpen() || !state.foregroundEditorOpen || !state.foregroundPreviewHost || !state.previewFontsReady) return;
    const token = ++foregroundPreviewRenderToken;

    try {
      const previewData = buildForegroundPreviewData();
      const url = URL.createObjectURL(await renderCardPngBlob(previewData));
      if (token !== foregroundPreviewRenderToken || !getOpen() || !state.foregroundEditorOpen) {
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
  }

  async function warmupPreviewAfterFontsReady() {
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
  }

  function measureForegroundRenderBounds() {
    if (!state.foregroundPreviewHost) return;

    const content = state.foregroundPreviewHost.firstElementChild as HTMLElement | null;
    const bounds = calculateForegroundRenderBounds({
      contentWidth: content?.clientWidth,
      contentHeight: content?.clientHeight,
      contentOffsetX: content?.offsetLeft,
      contentOffsetY: content?.offsetTop,
      hostWidth: state.foregroundPreviewHost.clientWidth,
      hostHeight: state.foregroundPreviewHost.clientHeight,
    });

    state.foregroundRenderWidth = bounds.width;
    state.foregroundRenderHeight = bounds.height;
    state.foregroundRenderOffsetX = bounds.offsetX;
    state.foregroundRenderOffsetY = bounds.offsetY;
  }

  function stopForegroundInteraction() {
    state.foregroundDragMode = null;
    state.foregroundDragPointerId = null;
    window.removeEventListener('pointermove', handleForegroundPointerMove);
    window.removeEventListener('pointerup', handleForegroundPointerUp);
    window.removeEventListener('pointercancel', handleForegroundPointerUp);
  }

  function beginForegroundInteraction(event: PointerEvent, mode: ForegroundEditorMode) {
    if (!hasForegroundImage() || !state.foregroundPreviewHost) return;

    const selection = state.foregroundPreviewHost.parentElement?.querySelector<HTMLElement>('.foreground-selection') ?? null;
    const rect = selection?.getBoundingClientRect();
    const centerX = rect ? rect.left + rect.width / 2 : 0;
    const centerY = rect ? rect.top + rect.height / 2 : 0;
    const pointer = { x: event.clientX, y: event.clientY };
    const center = { x: centerX, y: centerY };

    event.preventDefault();
    event.stopPropagation();

    state.foregroundDragMode = mode;
    state.foregroundDragPointerId = event.pointerId;
    state.foregroundDragStartX = event.clientX;
    state.foregroundDragStartY = event.clientY;
    state.foregroundDragStartForegroundX = state.form.foregroundX;
    state.foregroundDragStartForegroundY = state.form.foregroundY;
    state.foregroundDragStartForegroundScale = state.form.foregroundScale;
    state.foregroundDragStartForegroundRotation = state.form.foregroundRotation;
    state.foregroundDragCenterClientX = centerX;
    state.foregroundDragCenterClientY = centerY;
    state.foregroundDragStartAngle = calculatePointerAngle(pointer, center);
    state.foregroundDragStartDistance = calculatePointerDistance(pointer, center);

    window.addEventListener('pointermove', handleForegroundPointerMove);
    window.addEventListener('pointerup', handleForegroundPointerUp);
    window.addEventListener('pointercancel', handleForegroundPointerUp);
  }

  function handleForegroundMovePointerDown(event: PointerEvent) {
    beginForegroundInteraction(event, 'move');
  }

  function handleForegroundScalePointerDown(event: PointerEvent) {
    beginForegroundInteraction(event, 'scale');
  }

  function handleForegroundRotatePointerDown(event: PointerEvent) {
    beginForegroundInteraction(event, 'rotate');
  }

  function handleForegroundPointerMove(event: PointerEvent) {
    if (state.foregroundDragPointerId !== event.pointerId || !state.foregroundDragMode) return;

    const pointer = { x: event.clientX, y: event.clientY };
    const center = {
      x: state.foregroundDragCenterClientX,
      y: state.foregroundDragCenterClientY,
    };

    if (state.foregroundDragMode === 'move') {
      updateForm(moveForegroundFromDrag({
        pointer,
        startPointer: {
          x: state.foregroundDragStartX,
          y: state.foregroundDragStartY,
        },
        startPosition: {
          x: state.foregroundDragStartForegroundX,
          y: state.foregroundDragStartForegroundY,
        },
        editorScale: getForegroundEditorScale(),
      }));
      return;
    }

    if (state.foregroundDragMode === 'scale') {
      updateForm(scaleForegroundFromDrag({
        pointer,
        center,
        startScale: state.foregroundDragStartForegroundScale,
        startDistance: state.foregroundDragStartDistance,
      }));
      return;
    }

    updateForm(rotateForegroundFromDrag({
      pointer,
      center,
      startRotation: state.foregroundDragStartForegroundRotation,
      startAngle: state.foregroundDragStartAngle,
    }));
  }

  function handleForegroundPointerUp(event: PointerEvent) {
    if (state.foregroundDragPointerId !== event.pointerId) return;
    stopForegroundInteraction();
  }

  async function handleDownload() {
    const card = getCard();
    state.isDownloading = true;

    try {
      const pngBlob = await renderCardBlob(buildPngData(), 'png');

      const targetPath = await tauriBridge.save({
        defaultPath: `${state.form.password || card.code || 'card'}.png`,
        filters: [{ name: 'PNG', extensions: ['png'] }],
      });
      if (!targetPath) return;

      const bytes = await blobToUint8Array(pngBlob);
      await writeBinaryFile(targetPath, Array.from(bytes));
      showToast(t('editor.card_image_download_success'), 'success');
    } catch (error) {
      console.error('Failed to download generated card image', error);
      showToast(t('editor.card_image_download_failed'), 'error');
    } finally {
      state.isDownloading = false;
    }
  }

  async function handleSaveJpg() {
    const cdbPath = source.cdbPath();
    const card = getCard();
    if (!cdbPath) {
      showToast(t('editor.card_image_save_jpg_missing_cdb'), 'error');
      return;
    }

    if (!isPositiveCardCode(card.code)) {
      showToast(t('editor.code_required'), 'error');
      return;
    }

    state.isSavingJpg = true;

    try {
      const picsDir = await getPicsDir(cdbPath);
      const picPath = await tauriBridge.join(picsDir, `${card.code}.jpg`);
      const fieldPicPath = await tauriBridge.join(picsDir, 'field', `${card.code}.jpg`);
      const jpgData = buildJpgData();

      let shouldOverwrite = true;
      if (await pathExists(picPath)) {
        shouldOverwrite = await tauriBridge.ask(t('editor.card_image_save_jpg_overwrite_confirm', {
          values: { code: String(card.code) },
        }), {
          title: t('editor.card_image_save_jpg_overwrite_title'),
          kind: 'warning',
        });
      }

      if (!shouldOverwrite) return;

      const jpgBlob = await renderCardBlob(jpgData, 'jpg', 0.92);
      const bytes = await blobToUint8Array(jpgBlob);

      let fieldArtBytes: Uint8Array | null = null;
      if (isFieldSpellRenderData(jpgData) && state.croppedImageDataUrl) {
        const fieldArtBlob = await renderSquareJpgBlob(state.croppedImageDataUrl, FIELD_SPELL_ART_SIZE, 0.92);
        fieldArtBytes = await blobToUint8Array(fieldArtBlob);
      }

      await writeBinaryFile(picPath, Array.from(bytes));
      if (fieldArtBytes) {
        await writeBinaryFile(fieldPicPath, Array.from(fieldArtBytes));
      }
      await source.onSavedJpg();
      showToast(t('editor.card_image_save_jpg_success', {
        values: { code: String(card.code) },
      }), 'success');
    } catch (error) {
      console.error('Failed to save rendered JPG to pics', error);
      showToast(t('editor.card_image_save_jpg_failed'), 'error');
    } finally {
      state.isSavingJpg = false;
    }
  }

  function handleBackdropClick(event: MouseEvent) {
    if (event.currentTarget === event.target) {
      closeDrawer();
    }
  }

  function closeForegroundEditor() {
    resetForegroundState();
    destroyForegroundPreview();
  }

  function handleForegroundBackdropClick(event: MouseEvent) {
    if (event.currentTarget === event.target) {
      closeForegroundEditor();
    }
  }

  $effect(() => {
    const open = source.open();
    const card = source.card();
    const hydrationKey = open
      ? [
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
        ].join('::')
      : '';

    if (!open) {
      lastHydrationKey = '';
      state.errorMessage = '';
      state.previewFontsReady = false;
      destroyPreview();
      destroyForegroundPreview();
      resetImageState();
      resetForegroundState();
      clearForegroundInitialState();
      revokeForegroundRenderableUrl();
      resetRenderResourceCache();
      return;
    }

    if (hydrationKey !== lastHydrationKey) {
      lastHydrationKey = hydrationKey;
      state.form = createCardImageFormData(card);
      state.lastFormLanguage = state.form.language;
      resetImageState();
      resetForegroundState();
      clearForegroundInitialState();
      revokeForegroundRenderableUrl();
      resetRenderResourceCache();
      destroyPreview();
      destroyForegroundPreview();
      void warmupPreviewAfterFontsReady();
    }
  });

  $effect(() => {
    if (!source.open()) return;

    const currentLanguage = state.form.language as CardImageLanguage;
    if (currentLanguage === state.lastFormLanguage) return;

    const card = source.card();
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
  });

  $effect(() => {
    if (!state.previewShell) return;

    previewResizeObserver?.disconnect();
    previewResizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      state.previewWidth = entry.contentRect.width;
      state.previewHeight = entry.contentRect.height;
    });
    previewResizeObserver.observe(state.previewShell);

    return () => {
      previewResizeObserver?.disconnect();
      previewResizeObserver = null;
    };
  });

  $effect(() => {
    if (!state.foregroundPreviewShell || !state.foregroundEditorOpen) return;

    foregroundResizeObserver?.disconnect();
    foregroundResizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      state.foregroundPreviewWidth = entry.contentRect.width;
      state.foregroundPreviewHeight = entry.contentRect.height;
      measureForegroundRenderBounds();
    });
    foregroundResizeObserver.observe(state.foregroundPreviewShell);

    return () => {
      foregroundResizeObserver?.disconnect();
      foregroundResizeObserver = null;
    };
  });

  $effect(() => {
    if (!source.open() || state.hasManualPreviewZoom) return;
    if (!state.previewWidth || !state.previewHeight) return;

    const nextZoomPercent = getAutoPreviewZoomPercent();
    if (state.previewZoomPercent === nextZoomPercent) return;
    state.previewZoomPercent = nextZoomPercent;
  });

  $effect(() => {
    if (!source.open()) return;

    trackPreviewDependencies();

    clearTimeout(previewTimer ?? undefined);
    previewTimer = setTimeout(() => {
      void refreshPreview();
    }, PREVIEW_RENDER_DEBOUNCE_MS);

    return () => {
      clearTimeout(previewTimer ?? undefined);
      previewTimer = null;
    };
  });

  $effect(() => {
    if (!state.foregroundEditorOpen) {
      clearTimeout(foregroundPreviewTimer ?? undefined);
      foregroundPreviewTimer = null;
      destroyForegroundPreview();
      stopForegroundInteraction();
      return;
    }

    trackPreviewDependencies();

    clearTimeout(foregroundPreviewTimer ?? undefined);
    foregroundPreviewTimer = setTimeout(() => {
      void refreshForegroundPreview();
    }, PREVIEW_RENDER_DEBOUNCE_MS);

    return () => {
      clearTimeout(foregroundPreviewTimer ?? undefined);
      foregroundPreviewTimer = null;
    };
  });

  $effect(() => {
    return () => {
      clearTimeout(previewTimer ?? undefined);
      clearTimeout(previewWarmupTimer ?? undefined);
      clearTimeout(foregroundPreviewTimer ?? undefined);
      destroyPreview();
      destroyForegroundPreview();
      previewResizeObserver?.disconnect();
      foregroundResizeObserver?.disconnect();
      revokeSourceImageUrl();
      revokeForegroundRenderableUrl();
      resetRenderResourceCache();
      stopForegroundInteraction();
    };
  });

  return {
    state,
    closeDrawer,
    openFilePicker,
    openConfigFilePicker,
    openForegroundFilePicker,
    openForegroundEditor,
    handleConfigImport,
    handleConfigFileUpload,
    handleConfigExport,
    handleAiTranslate,
    handleCropViewportResize,
    handleImageUpload,
    handleForegroundImageUpload,
    applyCrop,
    cancelCrop,
    handleCropPointerDown,
    handleCropResizePointerDown,
    handleCropPointerMove,
    handleCropPointerUp,
    handleCropWheel,
    rotateCropPreview,
    resetCropRotation,
    handleCropRotationInput,
    handleCropRotationNumberInput,
    handleCropRotationNumberBlur,
    getCropStageMetrics,
    adjustPreviewZoom,
    handlePreviewWheel,
    clearCustomNameColor,
    clearCustomNameShadowColor,
    applyNameColorPreset,
    isNameColorPresetActive,
    applyNameShadowColorPreset,
    isNameShadowColorPresetActive,
    updateForm,
    getOptionLabel,
    resetForegroundTransform,
    clearForegroundImage,
    hasForegroundImage,
    getForegroundEditorScale,
    getForegroundSelectionStyle,
    handleForegroundMovePointerDown,
    handleForegroundScalePointerDown,
    handleForegroundRotatePointerDown,
    handleDownload,
    handleSaveJpg,
    handleBackdropClick,
    closeForegroundEditor,
    handleForegroundBackdropClick,
  };
}
