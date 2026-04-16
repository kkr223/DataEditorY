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
import { toMediaProtocolSrc } from '$lib/utils/mediaProtocol';
import {
  CARD_IMAGE_LANGUAGE_OPTIONS,
  createCardImageFormData,
  getCardImageLocaleDefaults,
  normalizeCardImageFormData,
  parseCardImageConfigDocument,
  serializeCardImageConfigDocument,
  type CardImageFormData,
  type CardImageLanguage,
} from '$lib/utils/cardImage';
import { writeErrorLog } from '$lib/utils/errorLog';

export type YugiohCardConstructor = new (options: {
  view: HTMLElement;
  data: CardImageFormData;
  resourcePath: string;
}) => {
  imageLeaf?: {
    constructor?: new () => { set?: (data: Record<string, unknown>) => void };
    set?: (data: Record<string, unknown>) => void;
    zIndex?: number;
  };
  maskLeaf?: {
    constructor?: new () => { set?: (data: Record<string, unknown>) => void };
    set?: (data: Record<string, unknown>) => void;
    zIndex?: number;
  };
  leafer?: {
    destroy?: () => void;
    export: (type: string, options?: Record<string, unknown>) => Promise<unknown>;
    add?: (child: unknown) => void;
  };
  setData?: (data: CardImageFormData) => void;
  nameLeaf?: {
    constructor?: new () => { set?: (data: Record<string, unknown>) => void };
    set?: (data: Record<string, unknown>) => void;
    text?: string;
    fontFamily?: string;
    fontSize?: number;
    letterSpacing?: number;
    wordSpacing?: number;
    textAlign?: string;
    rtFontSize?: number;
    rtTop?: number;
    rtColor?: string;
    width?: number;
    height?: number;
    x?: number;
    y?: number;
    zIndex?: number;
    visible?: boolean;
    opacity?: number;
    scaleX?: number;
    scaleY?: number;
    strokeWidth?: number;
  };
  __customNameShadowLeaf?: {
    set?: (data: Record<string, unknown>) => void;
  } | null;
  __customForegroundLeaf?: {
    set?: (data: Record<string, unknown>) => void;
  } | null;
  __customEffectBlockFillLeaf?: {
    set?: (data: Record<string, unknown>) => void;
  } | null;
  __customEffectBlockBorderLeaf?: {
    set?: (data: Record<string, unknown>) => void;
  } | null;
};

export type CropBox = { x: number; y: number; size: number };
type DragMode = 'move' | 'resize' | null;
type ForegroundEditorMode = 'move' | 'scale' | 'rotate' | null;
type ForegroundInitialState = Pick<
  CardImageFormData,
  'foregroundWidth' | 'foregroundHeight' | 'foregroundX' | 'foregroundY' | 'foregroundScale' | 'foregroundRotation'
>;
type LabelOption = { value: string; label?: string; labelKey?: string };
export type ColorPreset = { value: string; labelKey: string };

const CARD_WIDTH = 1488;
const CARD_HEIGHT = 2079;
export const FOREGROUND_EDITOR_CARD_WIDTH = 1394;
export const FOREGROUND_EDITOR_CARD_HEIGHT = 2031;
const FOREGROUND_EDITOR_PADDING = 32;
const EFFECT_BLOCK_X = 76;
const EFFECT_BLOCK_Y = 1503;
const EFFECT_BLOCK_WIDTH = 1236;
const EFFECT_BLOCK_HEIGHT = 430;
const EFFECT_BLOCK_FILL_INSET_X = 16;
const EFFECT_BLOCK_FILL_INSET_Y = 16;
const EFFECT_BLOCK_FILL_INSET_RIGHT = 16;
const EFFECT_BLOCK_FILL_INSET_BOTTOM = 20;
const CROPPED_IMAGE_SIZE = 1024;
const MAX_CROP_PREVIEW_WIDTH = 900;
const MAX_CROP_PREVIEW_HEIGHT = 680;
const FOREGROUND_OVERLAY_Z_INDEX = 21;
const FOREGROUND_TOP_LAYER_Z_INDEX = 30;
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
export const MIN_FOREGROUND_SCALE = 0.05;
export const MAX_FOREGROUND_SCALE = 12;
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
    previewCard: null as InstanceType<YugiohCardConstructor> | null,
    fileInput: null as HTMLInputElement | null,
    configFileInput: null as HTMLInputElement | null,
    foregroundFileInput: null as HTMLInputElement | null,
    foregroundEditorOpen: false,
    foregroundPreviewHost: null as HTMLDivElement | null,
    foregroundPreviewShell: null as HTMLDivElement | null,
    foregroundPreviewCard: null as InstanceType<YugiohCardConstructor> | null,
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
    shouldRunInitialPostRenderRefresh: false,
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
    resolvedResourcePath: '',
  });

  let lastHydrationKey = '';
  let previewTimer: ReturnType<typeof setTimeout> | null = null;
  let previewWarmupTimer: ReturnType<typeof setTimeout> | null = null;
  let initialPostRenderRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  let hasRunInitialPostRenderRefresh = false;
  let lastPreviewRendererSignature = '';
  let foregroundPreviewTimer: ReturnType<typeof setTimeout> | null = null;
  let foregroundResizeObserver: ResizeObserver | null = null;
  let lastForegroundRendererSignature = '';
  let yugiohCardConstructorPromise: Promise<YugiohCardConstructor> | null = null;
  let hasPatchedYugiohCardConstructor = false;
  let resourcePathPromise: Promise<string> | null = null;
  let previewResizeObserver: ResizeObserver | null = null;

  function getCard() {
    return source.card();
  }

  function getOpen() {
    return source.open();
  }

  function dataUrlToBlob(dataUrl: string) {
    const [header, body = ''] = dataUrl.split(',', 2);
    const mimeMatch = /data:([^;]+)/.exec(header);
    const mime = mimeMatch?.[1] ?? 'application/octet-stream';
    const binary = atob(body);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime });
  }

  async function getResourcePath() {
    if (!tauriBridge.isTauri()) {
      return `${window.location.origin}/resources/yugioh-card`;
    }

    if (!resourcePathPromise) {
      resourcePathPromise = tauriBridge.resolveResource('resources/yugioh-card')
        .then((path) => toMediaProtocolSrc(path))
        .catch((error) => {
          console.error('Failed to resolve yugioh-card resource path', error);
          resourcePathPromise = null;
          return `${window.location.origin}/resources/yugioh-card`;
        });
    }

    return resourcePathPromise;
  }

  async function ensureResolvedResourcePath() {
    if (state.resolvedResourcePath) return state.resolvedResourcePath;
    state.resolvedResourcePath = await getResourcePath();
    return state.resolvedResourcePath;
  }

  function patchYugiohCardConstructor(YugiohCard: YugiohCardConstructor) {
    if (hasPatchedYugiohCardConstructor) {
      return YugiohCard;
    }

    const prototype = YugiohCard.prototype as YugiohCardConstructor['prototype'] & {
      draw?: () => void;
      drawSpellTrap?: () => void;
      updateScale?: () => void;
      spellTrapLeaf?: { set?: (data: Record<string, unknown>) => void } | null;
      pendulumLeaf?: { set?: (data: Record<string, unknown>) => void } | null;
      pendulumDescriptionLeaf?: { set?: (data: Record<string, unknown>) => void } | null;
      data?: CardImageFormData;
      [key: string]: unknown;
    };
    const originalDraw = prototype.draw;
    const originalDrawSpellTrap = prototype.drawSpellTrap;
    const drawSequence = [
      'drawCard',
      'drawName',
      'drawAttribute',
      'drawLevel',
      'drawRank',
      'drawSpellTrap',
      'drawImage',
      'drawMask',
      'drawPendulum',
      'drawPendulumDescription',
      'drawPackage',
      'drawLinkArrow',
      'drawEffect',
      'drawDescription',
      'drawAtkDefLink',
      'drawPassword',
      'drawCopyright',
      'drawLaser',
      'drawRare',
      'drawAttributeRare',
      'drawTwentieth',
    ] as const;
    const fallbackLeafByMethod: Partial<Record<(typeof drawSequence)[number], keyof typeof prototype>> = {
      drawSpellTrap: 'spellTrapLeaf',
      drawPendulum: 'pendulumLeaf',
      drawPendulumDescription: 'pendulumDescriptionLeaf',
    };

    if (typeof originalDraw === 'function') {
      prototype.draw = function patchedDraw(this: typeof prototype) {
        try {
          originalDraw.call(this);
        } catch {
          for (const methodName of drawSequence) {
            const method = this[methodName];
            if (typeof method !== 'function') continue;

            try {
              (method as () => void).call(this);
            } catch {
              const fallbackLeafKey = fallbackLeafByMethod[methodName];
              const fallbackLeaf = fallbackLeafKey
                ? this[fallbackLeafKey] as { set?: (data: Record<string, unknown>) => void } | null | undefined
                : null;
              fallbackLeaf?.set?.({ visible: false });
            }
          }

          this.updateScale?.();
        }
      };
    }

    if (typeof originalDrawSpellTrap !== 'function') {
      hasPatchedYugiohCardConstructor = true;
      return YugiohCard;
    }

    prototype.drawSpellTrap = function patchedDrawSpellTrap(this: typeof prototype) {
      try {
        originalDrawSpellTrap.call(this);
      } catch {
        this.spellTrapLeaf?.set?.({ visible: false });
      }
    };

    hasPatchedYugiohCardConstructor = true;
    return YugiohCard;
  }

  async function getYugiohCardConstructor(): Promise<YugiohCardConstructor> {
    if (!yugiohCardConstructorPromise) {
      yugiohCardConstructorPromise = import('yugioh-card').then((module) => patchYugiohCardConstructor(module.YugiohCard as YugiohCardConstructor));
    }
    return yugiohCardConstructorPromise;
  }

  function destroyPreview() {
    state.previewCard?.leafer?.destroy?.();
    state.previewCard = null;
    lastPreviewRendererSignature = '';
    if (state.previewHost) {
      state.previewHost.innerHTML = '';
    }
  }

  function destroyForegroundPreview() {
    state.foregroundPreviewCard?.leafer?.destroy?.();
    state.foregroundPreviewCard = null;
    lastForegroundRendererSignature = '';
    if (state.foregroundPreviewHost) {
      state.foregroundPreviewHost.innerHTML = '';
    }
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
    if (!state.foregroundPreviewWidth || !state.foregroundPreviewHeight) {
      return 0.32;
    }

    const availableWidth = Math.max(state.foregroundPreviewWidth - FOREGROUND_EDITOR_PADDING * 2, 1);
    const availableHeight = Math.max(state.foregroundPreviewHeight - FOREGROUND_EDITOR_PADDING * 2, 1);
    return Math.min(availableWidth / FOREGROUND_EDITOR_CARD_WIDTH, availableHeight / FOREGROUND_EDITOR_CARD_HEIGHT);
  }

  function clampForegroundScale(scale: number) {
    return Math.max(MIN_FOREGROUND_SCALE, Math.min(MAX_FOREGROUND_SCALE, scale));
  }

  function getForegroundSelectionWidth() {
    return Math.max(0, state.form.foregroundWidth * state.form.foregroundScale);
  }

  function getForegroundSelectionHeight() {
    return Math.max(0, state.form.foregroundHeight * state.form.foregroundScale);
  }

  function hasForegroundImage() {
    return Boolean(state.form.foregroundImage && state.form.foregroundWidth > 0 && state.form.foregroundHeight > 0);
  }

  function getForegroundSelectionStyle() {
    const renderScaleX = state.foregroundRenderWidth > 0 ? state.foregroundRenderWidth / FOREGROUND_EDITOR_CARD_WIDTH : 1;
    const renderScaleY = state.foregroundRenderHeight > 0 ? state.foregroundRenderHeight / FOREGROUND_EDITOR_CARD_HEIGHT : 1;
    const width = getForegroundSelectionWidth();
    const height = getForegroundSelectionHeight();
    return [
      `left:${state.foregroundRenderOffsetX + (state.form.foregroundX - width / 2) * renderScaleX}px`,
      `top:${state.foregroundRenderOffsetY + (state.form.foregroundY - height / 2) * renderScaleY}px`,
      `width:${width * renderScaleX}px`,
      `height:${height * renderScaleY}px`,
      `transform:rotate(${state.form.foregroundRotation}deg)`,
    ].join(';');
  }

  function getDefaultForegroundScale(width: number, height: number) {
    if (!width || !height) {
      return 1;
    }

    return clampForegroundScale(Math.min(
      1,
      (FOREGROUND_EDITOR_CARD_WIDTH * 0.92) / width,
      (FOREGROUND_EDITOR_CARD_HEIGHT * 0.92) / height,
    ));
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
      foregroundWidth: 0,
      foregroundHeight: 0,
      foregroundScale: 1,
      foregroundRotation: 0,
      foregroundX: FOREGROUND_EDITOR_CARD_WIDTH / 2,
      foregroundY: FOREGROUND_EDITOR_CARD_HEIGHT / 2,
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

  function createForegroundInitialStateFromForm(data: CardImageFormData): ForegroundInitialState | null {
    if (!data.foregroundImage || data.foregroundWidth <= 0 || data.foregroundHeight <= 0) {
      return null;
    }

    return {
      foregroundWidth: data.foregroundWidth,
      foregroundHeight: data.foregroundHeight,
      foregroundX: data.foregroundX,
      foregroundY: data.foregroundY,
      foregroundScale: data.foregroundScale,
      foregroundRotation: data.foregroundRotation,
    };
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
    return (state.cropRotation * Math.PI) / 180;
  }

  function getCropStageMetrics() {
    if (!state.sourceImageWidth || !state.sourceImageHeight) {
      return {
        stageWidth: 0,
        stageHeight: 0,
        imageWidth: 0,
        imageHeight: 0,
        imageOffsetX: 0,
        imageOffsetY: 0,
        renderWidth: 0,
        renderHeight: 0,
      };
    }

    const angle = getCropRotationRadians();
    const cos = Math.abs(Math.cos(angle));
    const sin = Math.abs(Math.sin(angle));
    const rotatedWidth = state.sourceImageWidth * cos + state.sourceImageHeight * sin;
    const rotatedHeight = state.sourceImageWidth * sin + state.sourceImageHeight * cos;
    const isStackedLayout = state.cropViewportWidth <= CROP_LAYOUT_BREAKPOINT;
    const bodyWidth = state.cropBodyElement?.clientWidth ?? 0;
    const sidebarWidth = isStackedLayout ? 0 : (state.cropSidebarElement?.clientWidth ?? CROP_SIDEBAR_FALLBACK_WIDTH);
    const maxWidth = Math.min(
      bodyWidth > 0
        ? Math.max(bodyWidth - sidebarWidth - (isStackedLayout ? 0 : CROP_LAYOUT_GAP), MIN_CROP_SIZE)
        : state.cropViewportWidth * 0.86,
      MAX_CROP_PREVIEW_WIDTH,
    );
    const maxHeight = Math.min(state.cropViewportHeight * 0.68, MAX_CROP_PREVIEW_HEIGHT);
    const scale = Math.min(maxWidth / rotatedWidth, maxHeight / rotatedHeight, 1);
    const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
    const stageWidth = rotatedWidth * safeScale;
    const stageHeight = rotatedHeight * safeScale;
    const imageWidth = state.sourceImageWidth * safeScale;
    const imageHeight = state.sourceImageHeight * safeScale;

    return {
      stageWidth,
      stageHeight,
      imageWidth,
      imageHeight,
      imageOffsetX: (stageWidth - imageWidth) / 2,
      imageOffsetY: (stageHeight - imageHeight) / 2,
      renderWidth: Math.max(1, Math.round(rotatedWidth)),
      renderHeight: Math.max(1, Math.round(rotatedHeight)),
    };
  }

  function clampCropBox(nextBox: CropBox): CropBox {
    const { stageWidth, stageHeight } = getCropStageMetrics();
    if (!stageWidth || !stageHeight) return nextBox;

    const maxSize = Math.min(stageWidth, stageHeight);
    const size = Math.min(Math.max(nextBox.size, MIN_CROP_SIZE), maxSize);
    const x = Math.min(Math.max(nextBox.x, 0), Math.max(stageWidth - size, 0));
    const y = Math.min(Math.max(nextBox.y, 0), Math.max(stageHeight - size, 0));

    return { x, y, size };
  }

  function initializeCropBox() {
    const { stageWidth, stageHeight } = getCropStageMetrics();
    if (!stageWidth || !stageHeight) return;

    const size = Math.max(MIN_CROP_SIZE, Math.min(stageWidth, stageHeight) * 0.72);
    state.cropBox = {
      x: (stageWidth - size) / 2,
      y: (stageHeight - size) / 2,
      size,
    };
  }

  function normalizeCropRotation(nextRotation: number) {
    const normalized = (((Math.round(nextRotation) + 180) % 360) + 360) % 360 - 180;
    return normalized === -180 ? 180 : normalized;
  }

  function setCropRotation(nextRotation: number) {
    const next = normalizeCropRotation(nextRotation);
    if (next === state.cropRotation) return;

    const centerX = state.cropBox.x + state.cropBox.size / 2;
    const centerY = state.cropBox.y + state.cropBox.size / 2;
    const size = state.cropBox.size;

    state.cropRotation = next;
    state.cropBox = size
      ? clampCropBox({
          x: centerX - size / 2,
          y: centerY - size / 2,
          size,
        })
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

  function handleCropViewportResize() {
    if (typeof window === 'undefined') return;
    state.cropViewportWidth = window.innerWidth;
    state.cropViewportHeight = window.innerHeight;
    if (!state.cropModalOpen) return;
    if (!state.cropBox.size) {
      initializeCropBox();
      return;
    }

    const centerX = state.cropBox.x + state.cropBox.size / 2;
    const centerY = state.cropBox.y + state.cropBox.size / 2;
    state.cropBox = clampCropBox({
      x: centerX - state.cropBox.size / 2,
      y: centerY - state.cropBox.size / 2,
      size: state.cropBox.size,
    });
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
      const nextInitialState: ForegroundInitialState = {
        foregroundWidth: uploaded.width,
        foregroundHeight: uploaded.height,
        foregroundX: isReplacing ? state.form.foregroundX : FOREGROUND_EDITOR_CARD_WIDTH / 2,
        foregroundY: isReplacing ? state.form.foregroundY : FOREGROUND_EDITOR_CARD_HEIGHT / 2,
        foregroundScale: isReplacing ? state.form.foregroundScale : getDefaultForegroundScale(uploaded.width, uploaded.height),
        foregroundRotation: isReplacing ? state.form.foregroundRotation : 0,
      };
      state.initialForegroundState = nextInitialState;
      await syncForegroundRenderableUrl(uploaded.dataUrl);
      updateForm({
        foregroundImage: uploaded.dataUrl,
        foregroundWidth: nextInitialState.foregroundWidth,
        foregroundHeight: nextInitialState.foregroundHeight,
        foregroundX: nextInitialState.foregroundX,
        foregroundY: nextInitialState.foregroundY,
        foregroundScale: nextInitialState.foregroundScale,
        foregroundRotation: nextInitialState.foregroundRotation,
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
      state.cropBox = clampCropBox({
        x: state.dragStartBox.x + dx,
        y: state.dragStartBox.y + dy,
        size: state.dragStartBox.size,
      });
      return;
    }

    state.cropBox = clampCropBox({
      x: state.dragStartBox.x,
      y: state.dragStartBox.y,
      size: state.dragStartBox.size + Math.max(dx, dy),
    });
  }

  function handleCropPointerUp(event: PointerEvent) {
    if (state.dragPointerId !== event.pointerId) return;
    state.dragMode = null;
    state.dragPointerId = null;
  }

  function handleCropWheel(event: WheelEvent) {
    event.preventDefault();
    const delta = Math.sign(event.deltaY) * 20;
    const centerX = state.cropBox.x + state.cropBox.size / 2;
    const centerY = state.cropBox.y + state.cropBox.size / 2;
    const nextSize = state.cropBox.size - delta;
    state.cropBox = clampCropBox({
      x: centerX - nextSize / 2,
      y: centerY - nextSize / 2,
      size: nextSize,
    });
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

  function applyAutoRarityStyle(data: CardImageFormData): CardImageFormData {
    const rarity = String(data.rare ?? '').trim().toLowerCase();
    if (!rarity || data.color || data.gradient) {
      return data;
    }

    const styleMap: Record<string, Pick<CardImageFormData, 'color' | 'gradient' | 'gradientColor1' | 'gradientColor2'>> = {
      ur: { color: '#f3cc63', gradient: true, gradientColor1: '#8a5d17', gradientColor2: '#f8e6a2' },
      gr: { color: '#d8dde6', gradient: true, gradientColor1: '#6d7683', gradientColor2: '#f4f7fb' },
      hr: { color: '#eef2f8', gradient: true, gradientColor1: '#8e99a9', gradientColor2: '#ffffff' },
      ser: { color: '#edf2f8', gradient: true, gradientColor1: '#8b95a4', gradientColor2: '#ffffff' },
      gser: { color: '#f1d377', gradient: true, gradientColor1: '#8a6422', gradientColor2: '#fff1be' },
      pser: { color: '#f5d6ef', gradient: true, gradientColor1: '#855f86', gradientColor2: '#fff5fd' },
    };

    const style = styleMap[rarity];
    return style ? { ...data, ...style } : data;
  }

  function buildPreviewData(): CardImageFormData {
    return applyAutoRarityStyle(applyExtraBuildIsolation(normalizeCardImageFormData({
      ...state.form,
      image: state.croppedImageDataUrl,
      scale: Math.max(getPreviewScale(), 0.1),
    })));
  }

  function buildJpgData(): CardImageFormData {
    return applyAutoRarityStyle(applyExtraBuildIsolation(normalizeCardImageFormData({
      ...state.form,
      image: state.croppedImageDataUrl,
      scale: state.exportScalePercent / 100,
    })));
  }

  function buildPngData(): CardImageFormData {
    return applyAutoRarityStyle(applyExtraBuildIsolation(normalizeCardImageFormData({
      ...state.form,
      image: state.croppedImageDataUrl,
      scale: 1,
    })));
  }

  function buildForegroundPreviewData(): CardImageFormData {
    return applyAutoRarityStyle(normalizeCardImageFormData({
      ...state.form,
      image: state.croppedImageDataUrl,
      scale: 1,
    }));
  }

  function isFieldSpellCard(data: CardImageFormData) {
    return data.type === 'spell' && data.icon === 'field';
  }

  function getRendererSignature(data: CardImageFormData) {
    return [
      data.language,
      data.font,
      data.type,
      data.cardType,
      data.pendulumType,
      data.icon,
      data.attribute,
      data.radius ? 'rounded' : 'square',
    ].join('|');
  }

  function buildBootstrapPreviewData(data: CardImageFormData): CardImageFormData {
    return normalizeCardImageFormData({
      language: data.language,
      font: data.font,
      name: '',
      color: '',
      align: 'left',
      gradient: false,
      gradientColor1: '#999999',
      gradientColor2: '#ffffff',
      type: 'monster',
      attribute: data.attribute || 'dark',
      icon: '',
      image: '',
      cardType: 'normal',
      pendulumType: 'effect-pendulum',
      level: 0,
      rank: 0,
      pendulumScale: 0,
      pendulumDescription: '',
      monsterType: '',
      atkBar: true,
      atk: 0,
      def: 0,
      arrowList: [],
      description: '',
      firstLineCompress: false,
      descriptionAlign: false,
      descriptionZoom: 1,
      descriptionWeight: 0,
      package: '',
      password: '',
      copyright: data.copyright,
      laser: '',
      rare: '',
      twentieth: false,
      radius: data.radius,
      scale: data.scale,
    });
  }

  function applyExtraBuildIsolation(data: CardImageFormData): CardImageFormData {
    if (HAS_EXTRA_BUILD) {
      return data;
    }

    return normalizeCardImageFormData({
      ...data,
      foregroundImage: '',
      foregroundWidth: 0,
      foregroundHeight: 0,
      foregroundScale: 1,
      foregroundRotation: 0,
      foregroundX: FOREGROUND_EDITOR_CARD_WIDTH / 2,
      foregroundY: FOREGROUND_EDITOR_CARD_HEIGHT / 2,
      effectBlockEnabled: false,
      effectBlockColor: '#f6f2e8',
      effectBlockOpacity: 0.78,
    });
  }

  async function renderSquareJpgBlob(dataUrl: string, size: number, quality = 0.92) {
    const image = new Image();
    image.src = dataUrl;
    await image.decode();

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas context unavailable');
    }

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.clearRect(0, 0, size, size);
    context.drawImage(image, 0, 0, size, size);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', quality);
    });
    if (blob) {
      return blob;
    }

    return dataUrlToBlob(canvas.toDataURL('image/jpeg', quality));
  }

  function hasCustomNameShadowStyle(data: CardImageFormData) {
    return Boolean(
      data.nameShadowGradient
        ? data.nameShadowGradientColor1.trim() && data.nameShadowGradientColor2.trim()
        : data.nameShadowColor.trim(),
    );
  }

  function hasEffectBlock(data: CardImageFormData) {
    return Boolean(
      data.effectBlockEnabled
      && data.effectBlockWidth > 0
      && data.effectBlockHeight > 0
      && data.effectBlockOpacity > 0,
    );
  }

  function hasForegroundOverlay(data: CardImageFormData) {
    return Boolean(
      HAS_EXTRA_BUILD
      && data.foregroundImage.trim()
      && data.foregroundWidth > 0
      && data.foregroundHeight > 0
      && data.foregroundScale > 0,
    );
  }

  function createSolidRectSvgDataUrl(width: number, height: number, color: string, opacity: number) {
    const safeWidth = Math.max(1, Math.round(width));
    const safeHeight = Math.max(1, Math.round(height));
    const safeOpacity = Math.max(0, Math.min(opacity, 1));
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${safeWidth}" height="${safeHeight}" viewBox="0 0 ${safeWidth} ${safeHeight}"><rect width="${safeWidth}" height="${safeHeight}" fill="${color}" fill-opacity="${safeOpacity}"/></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  function applyNameLeafEnhancements(cardInstance: InstanceType<YugiohCardConstructor> | null, data: CardImageFormData) {
    if (!cardInstance?.nameLeaf) return;

    const mainNameLeaf = cardInstance.nameLeaf;
    if (data.color.trim() || data.gradient) {
      mainNameLeaf.set?.({
        color: data.color,
        gradient: data.gradient,
        gradientColor1: data.gradientColor1,
        gradientColor2: data.gradientColor2,
      });
    }

    if (!hasCustomNameShadowStyle(data)) {
      cardInstance.__customNameShadowLeaf?.set?.({ visible: false });
      return;
    }

    const ShadowLeaf = mainNameLeaf.constructor;
    if (!ShadowLeaf) return;

    if (!cardInstance.__customNameShadowLeaf) {
      cardInstance.__customNameShadowLeaf = new ShadowLeaf();
      cardInstance.leafer?.add?.(cardInstance.__customNameShadowLeaf);
    }

    cardInstance.__customNameShadowLeaf?.set?.({
      text: mainNameLeaf.text,
      fontFamily: mainNameLeaf.fontFamily,
      fontSize: mainNameLeaf.fontSize,
      letterSpacing: mainNameLeaf.letterSpacing,
      wordSpacing: mainNameLeaf.wordSpacing,
      textAlign: mainNameLeaf.textAlign,
      rtFontSize: mainNameLeaf.rtFontSize,
      rtTop: mainNameLeaf.rtTop,
      rtColor: data.nameShadowGradient ? data.nameShadowGradientColor1 : data.nameShadowColor,
      width: mainNameLeaf.width,
      height: mainNameLeaf.height,
      x: (mainNameLeaf.x ?? 0) + 7,
      y: (mainNameLeaf.y ?? 0) + 7,
      zIndex: (mainNameLeaf.zIndex ?? 30) - 1,
      visible: mainNameLeaf.visible !== false,
      opacity: mainNameLeaf.opacity ?? 0.92,
      scaleX: mainNameLeaf.scaleX,
      scaleY: mainNameLeaf.scaleY,
      strokeWidth: mainNameLeaf.strokeWidth,
      color: data.nameShadowColor,
      gradient: data.nameShadowGradient,
      gradientColor1: data.nameShadowGradientColor1,
      gradientColor2: data.nameShadowGradientColor2,
    });
  }

  function setLeafMinimumZIndex(
    leaf: { set?: (data: Record<string, unknown>) => void; zIndex?: number } | null | undefined,
    zIndex: number,
  ) {
    if (!leaf?.set) return;
    if (typeof leaf.zIndex === 'number' && leaf.zIndex >= zIndex) return;
    leaf.set({ zIndex });
  }

  function applyForegroundLayerOrdering(cardInstance: InstanceType<YugiohCardConstructor> | null) {
    if (!cardInstance) return;

    const layeredLeafKeys = [
      'nameLeaf', 'attributeLeaf', 'levelLeaf', 'rankLeaf', 'spellTrapLeaf', 'pendulumLeaf', 'pendulumDescriptionLeaf',
      'packageLeaf', 'effectLeaf', 'descriptionLeaf', 'maximumAtkLeaf', 'atkDefLeaf', 'atkDefLinkLeaf', 'passwordLeaf',
      'copyrightLeaf', 'attributeRareLeaf', 'legendLeaf', 'linkArrowLeaf', 'rareLeaf', 'laserLeaf', 'twentiethLeaf',
    ] as const;

    for (const key of layeredLeafKeys) {
      const leaf = (cardInstance as unknown as Record<string, { set?: (data: Record<string, unknown>) => void; zIndex?: number } | null | undefined>)[key];
      setLeafMinimumZIndex(leaf, FOREGROUND_TOP_LAYER_Z_INDEX);
    }
  }

  function applyForegroundOverlay(
    cardInstance: InstanceType<YugiohCardConstructor> | null,
    data: CardImageFormData,
    renderableUrl = '',
  ) {
    const LeafConstructor = cardInstance?.maskLeaf?.constructor;
    if (!cardInstance?.leafer?.add || !LeafConstructor) return;

    if (!cardInstance.__customForegroundLeaf) {
      cardInstance.__customForegroundLeaf = new LeafConstructor();
      cardInstance.leafer.add(cardInstance.__customForegroundLeaf);
    }

    if (!hasForegroundOverlay(data)) {
      cardInstance.__customForegroundLeaf?.set?.({ visible: false });
      return;
    }

    const overlayUrl = renderableUrl.trim() || data.foregroundImage;

    cardInstance.__customForegroundLeaf?.set?.({
      url: overlayUrl,
      width: data.foregroundWidth,
      height: data.foregroundHeight,
      x: data.foregroundX,
      y: data.foregroundY,
      scaleX: data.foregroundScale,
      scaleY: data.foregroundScale,
      rotation: data.foregroundRotation,
      around: { type: 'percent', x: 0.5, y: 0.5 },
      visible: true,
      zIndex: Math.max((cardInstance.maskLeaf?.zIndex ?? 20) + 1, FOREGROUND_OVERLAY_Z_INDEX),
    });
  }

  function applyEffectBlockOverlay(
    cardInstance: InstanceType<YugiohCardConstructor> | null,
    data: CardImageFormData,
    resourcePath: string,
  ) {
    const LeafConstructor = cardInstance?.maskLeaf?.constructor;
    if (!cardInstance?.leafer?.add || !LeafConstructor) return;

    if (!cardInstance.__customEffectBlockFillLeaf) {
      cardInstance.__customEffectBlockFillLeaf = new LeafConstructor();
      cardInstance.leafer.add(cardInstance.__customEffectBlockFillLeaf);
    }

    if (!cardInstance.__customEffectBlockBorderLeaf) {
      cardInstance.__customEffectBlockBorderLeaf = new LeafConstructor();
      cardInstance.leafer.add(cardInstance.__customEffectBlockBorderLeaf);
    }

    if (!hasEffectBlock(data)) {
      cardInstance.__customEffectBlockFillLeaf?.set?.({ visible: false });
      cardInstance.__customEffectBlockBorderLeaf?.set?.({ visible: false });
      return;
    }

    const fillUrl = createSolidRectSvgDataUrl(
      EFFECT_BLOCK_WIDTH - EFFECT_BLOCK_FILL_INSET_X - EFFECT_BLOCK_FILL_INSET_RIGHT,
      EFFECT_BLOCK_HEIGHT - EFFECT_BLOCK_FILL_INSET_Y - EFFECT_BLOCK_FILL_INSET_BOTTOM,
      data.effectBlockColor,
      data.effectBlockOpacity,
    );
    const borderUrl = `${resourcePath}/yugioh/image/eblock-border.png`;

    cardInstance.__customEffectBlockFillLeaf?.set?.({
      url: fillUrl,
      x: EFFECT_BLOCK_X + EFFECT_BLOCK_FILL_INSET_X,
      y: EFFECT_BLOCK_Y + EFFECT_BLOCK_FILL_INSET_Y,
      width: EFFECT_BLOCK_WIDTH - EFFECT_BLOCK_FILL_INSET_X - EFFECT_BLOCK_FILL_INSET_RIGHT,
      height: EFFECT_BLOCK_HEIGHT - EFFECT_BLOCK_FILL_INSET_Y - EFFECT_BLOCK_FILL_INSET_BOTTOM,
      visible: true,
      zIndex: 28,
    });
    cardInstance.__customEffectBlockBorderLeaf?.set?.({
      url: borderUrl,
      x: EFFECT_BLOCK_X,
      y: EFFECT_BLOCK_Y,
      width: EFFECT_BLOCK_WIDTH,
      height: EFFECT_BLOCK_HEIGHT,
      visible: true,
      zIndex: 29,
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

  async function renderCardBlob(
    data: CardImageFormData,
    type: 'png' | 'jpg',
    quality?: number,
  ) {
    const YugiohCard = await getYugiohCardConstructor();
    const host = document.createElement('div');
    host.style.position = 'fixed';
    host.style.left = '-99999px';
    host.style.top = '0';
    document.body.appendChild(host);
    let exportCard: InstanceType<YugiohCardConstructor> | null = null;

    try {
      const resourcePath = await getResourcePath();
      state.resolvedResourcePath = resourcePath;
      exportCard = new YugiohCard({
        view: host,
        data,
        resourcePath,
      });

      await tick();
      if (hasForegroundOverlay(data)) {
        applyForegroundLayerOrdering(exportCard);
      }
      applyForegroundOverlay(exportCard, data, state.foregroundRenderableUrl);
      applyEffectBlockOverlay(exportCard, data, resourcePath);
      applyNameLeafEnhancements(exportCard, data);
      if (!exportCard.leafer) {
        throw new Error('Export renderer unavailable');
      }

      const exported = await exportCard.leafer.export(type, {
        screenshot: true,
        pixelRatio: 1,
        blob: true,
        ...(quality !== undefined ? { quality } : {}),
      });
      const candidate = exported && typeof exported === 'object' && 'data' in exported
        ? (exported as { data: unknown }).data
        : exported;

      if (candidate instanceof Blob) {
        return candidate;
      }

      if (typeof candidate === 'string') {
        const response = await fetch(candidate);
        return await response.blob();
      }

      throw new Error('Export did not return a Blob');
    } finally {
      exportCard?.leafer?.destroy?.();
      host.remove();
    }
  }

  async function blobToUint8Array(blob: Blob) {
    const arrayBuffer = await blob.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }

  async function ensurePreviewCard(initialData: CardImageFormData) {
    await tick();
    if (!getOpen() || !state.previewHost) return null;

    const YugiohCard = await getYugiohCardConstructor();
    if (!state.previewCard) {
      state.previewCard = new YugiohCard({
        view: state.previewHost,
        data: buildBootstrapPreviewData(initialData),
        resourcePath: await ensureResolvedResourcePath(),
      });
    }

    return state.previewCard;
  }

  async function ensureForegroundPreviewCard(initialData: CardImageFormData) {
    await tick();
    if (!getOpen() || !state.foregroundEditorOpen || !state.foregroundPreviewHost) return null;

    const YugiohCard = await getYugiohCardConstructor();
    if (!state.foregroundPreviewCard) {
      state.foregroundPreviewCard = new YugiohCard({
        view: state.foregroundPreviewHost,
        data: buildBootstrapPreviewData(initialData),
        resourcePath: await ensureResolvedResourcePath(),
      });
    }

    return state.foregroundPreviewCard;
  }

  async function refreshPreview() {
    if (!getOpen() || !state.previewHost || !state.previewFontsReady) return;

    try {
      state.errorMessage = '';
      const resourcePath = await ensureResolvedResourcePath();
      const previewData = buildPreviewData();
      const rendererSignature = getRendererSignature(previewData);
      if (rendererSignature !== lastPreviewRendererSignature) {
        destroyPreview();
        lastPreviewRendererSignature = rendererSignature;
      }

      let cardInstance = await ensurePreviewCard(previewData);
      try {
        cardInstance?.setData?.(previewData);
      } catch {
        destroyPreview();
        lastPreviewRendererSignature = rendererSignature;
        cardInstance = await ensurePreviewCard(previewData);
        cardInstance?.setData?.(previewData);
      }

      if (hasForegroundOverlay(previewData)) {
        applyForegroundLayerOrdering(cardInstance);
      }
      applyForegroundOverlay(cardInstance, previewData, state.foregroundRenderableUrl);
      applyEffectBlockOverlay(cardInstance, previewData, resourcePath);
      applyNameLeafEnhancements(cardInstance, previewData);

      if (state.shouldRunInitialPostRenderRefresh && !hasRunInitialPostRenderRefresh) {
        state.shouldRunInitialPostRenderRefresh = false;
        hasRunInitialPostRenderRefresh = true;
        clearTimeout(initialPostRenderRefreshTimer ?? undefined);
        initialPostRenderRefreshTimer = setTimeout(() => {
          if (!getOpen()) return;
          destroyPreview();
          void refreshPreview();
        }, 180);
      }
    } catch (error) {
      console.error('Failed to refresh card image preview', error);
      state.errorMessage = t('editor.card_image_generate_failed');
    }
  }

  async function refreshForegroundPreview() {
    if (!getOpen() || !state.foregroundEditorOpen || !state.foregroundPreviewHost || !state.previewFontsReady) return;

    try {
      const resourcePath = await ensureResolvedResourcePath();
      const previewData = buildForegroundPreviewData();
      const rendererSignature = getRendererSignature(previewData);
      if (rendererSignature !== lastForegroundRendererSignature) {
        destroyForegroundPreview();
        lastForegroundRendererSignature = rendererSignature;
      }

      let cardInstance = await ensureForegroundPreviewCard(previewData);
      try {
        cardInstance?.setData?.(previewData);
      } catch {
        destroyForegroundPreview();
        lastForegroundRendererSignature = rendererSignature;
        cardInstance = await ensureForegroundPreviewCard(previewData);
        cardInstance?.setData?.(previewData);
      }

      if (hasForegroundOverlay(previewData)) {
        applyForegroundLayerOrdering(cardInstance);
      }
      applyForegroundOverlay(cardInstance, previewData, state.foregroundRenderableUrl);
      applyEffectBlockOverlay(cardInstance, previewData, resourcePath);
      applyNameLeafEnhancements(cardInstance, previewData);
      await tick();
      requestAnimationFrame(() => {
        measureForegroundRenderBounds();
      });
    } catch (error) {
      console.error('Failed to refresh foreground editor preview', error);
    }
  }

  async function warmupPreviewAfterFontsReady() {
    state.previewFontsReady = false;
    hasRunInitialPostRenderRefresh = false;
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
      state.shouldRunInitialPostRenderRefresh = true;
      destroyPreview();
      void refreshPreview();
    }, 100);
  }

  function getPointerAngle(clientX: number, clientY: number, centerX: number, centerY: number) {
    return Math.atan2(clientY - centerY, clientX - centerX) * 180 / Math.PI;
  }

  function measureForegroundRenderBounds() {
    if (!state.foregroundPreviewHost) return;

    const content = state.foregroundPreviewHost.firstElementChild as HTMLElement | null;
    const nextWidth = content?.clientWidth || state.foregroundPreviewHost.clientWidth || FOREGROUND_EDITOR_CARD_WIDTH;
    const nextHeight = content?.clientHeight || state.foregroundPreviewHost.clientHeight || FOREGROUND_EDITOR_CARD_HEIGHT;
    const nextOffsetX = content?.offsetLeft ?? 0;
    const nextOffsetY = content?.offsetTop ?? 0;

    state.foregroundRenderWidth = nextWidth;
    state.foregroundRenderHeight = nextHeight;
    state.foregroundRenderOffsetX = nextOffsetX;
    state.foregroundRenderOffsetY = nextOffsetY;
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
    state.foregroundDragStartAngle = getPointerAngle(event.clientX, event.clientY, centerX, centerY);
    state.foregroundDragStartDistance = Math.max(Math.hypot(event.clientX - centerX, event.clientY - centerY), 1);

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

    const editorScale = Math.max(getForegroundEditorScale(), 0.01);

    if (state.foregroundDragMode === 'move') {
      updateForm({
        foregroundX: state.foregroundDragStartForegroundX + (event.clientX - state.foregroundDragStartX) / editorScale,
        foregroundY: state.foregroundDragStartForegroundY + (event.clientY - state.foregroundDragStartY) / editorScale,
      });
      return;
    }

    if (state.foregroundDragMode === 'scale') {
      const currentDistance = Math.max(
        Math.hypot(event.clientX - state.foregroundDragCenterClientX, event.clientY - state.foregroundDragCenterClientY),
        1,
      );
      updateForm({
        foregroundScale: clampForegroundScale(
          state.foregroundDragStartForegroundScale * (currentDistance / state.foregroundDragStartDistance),
        ),
      });
      return;
    }

    const nextAngle = getPointerAngle(
      event.clientX,
      event.clientY,
      state.foregroundDragCenterClientX,
      state.foregroundDragCenterClientY,
    );
    updateForm({
      foregroundRotation: state.foregroundDragStartForegroundRotation + (nextAngle - state.foregroundDragStartAngle),
    });
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
      if (isFieldSpellCard(jpgData) && state.croppedImageDataUrl) {
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
      state.shouldRunInitialPostRenderRefresh = false;
      hasRunInitialPostRenderRefresh = false;
      destroyPreview();
      destroyForegroundPreview();
      resetImageState();
      resetForegroundState();
      clearForegroundInitialState();
      revokeForegroundRenderableUrl();
      return;
    }

    if (hydrationKey !== lastHydrationKey) {
      lastHydrationKey = hydrationKey;
      state.form = createCardImageFormData(card);
      state.lastFormLanguage = state.form.language;
      state.shouldRunInitialPostRenderRefresh = false;
      hasRunInitialPostRenderRefresh = false;
      resetImageState();
      resetForegroundState();
      clearForegroundInitialState();
      revokeForegroundRenderableUrl();
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
      if (state.foregroundEditorOpen) {
        void refreshForegroundPreview();
      }
    }, 40);

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
    }, 40);

    return () => {
      clearTimeout(foregroundPreviewTimer ?? undefined);
      foregroundPreviewTimer = null;
    };
  });

  $effect(() => {
    return () => {
      clearTimeout(previewTimer ?? undefined);
      clearTimeout(previewWarmupTimer ?? undefined);
      clearTimeout(initialPostRenderRefreshTimer ?? undefined);
      clearTimeout(foregroundPreviewTimer ?? undefined);
      destroyPreview();
      destroyForegroundPreview();
      previewResizeObserver?.disconnect();
      foregroundResizeObserver?.disconnect();
      revokeSourceImageUrl();
      revokeForegroundRenderableUrl();
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
