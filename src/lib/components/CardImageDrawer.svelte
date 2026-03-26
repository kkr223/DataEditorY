<script lang="ts">
  import { tick } from "svelte";
  import { _ } from "svelte-i18n";
  import type { CardDataEntry } from "$lib/types";
  import { HAS_AI_FEATURE } from "$lib/config/build";
  import { showToast } from "$lib/stores/toast.svelte";
  import { tauriBridge } from "$lib/infrastructure/tauri";
  import { pathExists, writeBinaryFile } from "$lib/infrastructure/tauri/commands";
  import { createAiAppContext } from "$lib/services/aiAppContext";
  import { getPicsDir } from "$lib/services/cardImageService";
  import { toMediaProtocolSrc } from "$lib/utils/mediaProtocol";
  import {
    CARD_IMAGE_ATTRIBUTE_OPTIONS,
    CARD_IMAGE_CARD_TYPE_OPTIONS,
    CARD_IMAGE_COPYRIGHT_OPTIONS,
    CARD_IMAGE_FONT_OPTIONS,
    CARD_IMAGE_ICON_OPTIONS,
    CARD_IMAGE_LANGUAGE_OPTIONS,
    CARD_IMAGE_LASER_OPTIONS,
    CARD_IMAGE_PENDULUM_TYPE_OPTIONS,
    CARD_IMAGE_RARE_OPTIONS,
    CARD_IMAGE_TYPE_OPTIONS,
    createCardImageFormData,
    getCardImageLocaleDefaults,
    normalizeCardImageFormData,
    type CardImageLanguage,
    type CardImageFormData,
  } from "$lib/utils/cardImage";
  import { writeErrorLog } from "$lib/utils/errorLog";

  type YugiohCardConstructor = new (options: {
    view: HTMLElement;
    data: CardImageFormData;
    resourcePath: string;
  }) => {
    maskLeaf?: {
      constructor?: new () => { set?: (data: Record<string, unknown>) => void };
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
    __customEffectBlockFillLeaf?: {
      set?: (data: Record<string, unknown>) => void;
    } | null;
    __customEffectBlockBorderLeaf?: {
      set?: (data: Record<string, unknown>) => void;
    } | null;
  };

  type CropBox = { x: number; y: number; size: number };
  type DragMode = "move" | "resize" | null;
  type ForegroundEditorMode = "move" | "scale" | "rotate" | null;
  type ForegroundInitialState = Pick<
    CardImageFormData,
    "foregroundWidth" | "foregroundHeight" | "foregroundX" | "foregroundY" | "foregroundScale" | "foregroundRotation"
  >;
  type LabelOption = { value: string; label?: string; labelKey?: string };

  const CARD_WIDTH = 1488;
  const CARD_HEIGHT = 2079;
  const FOREGROUND_EDITOR_CARD_WIDTH = 1394;
  const FOREGROUND_EDITOR_CARD_HEIGHT = 2031;
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
  const FIELD_SPELL_ART_SIZE = 512;
  const MIN_CROP_SIZE = 80;
  const MIN_EXPORT_SCALE_PERCENT = 10;
  const MAX_EXPORT_SCALE_PERCENT = 100;
  const DEFAULT_EXPORT_SCALE_PERCENT = 43;
  const MIN_PREVIEW_ZOOM_PERCENT = 60;
  const MAX_PREVIEW_ZOOM_PERCENT = 170;
  const DEFAULT_PREVIEW_ZOOM_PERCENT = 108;
  const PREVIEW_ZOOM_REFERENCE_WIDTH = 560;
  const PREVIEW_ZOOM_REFERENCE_HEIGHT = 800;
  const MIN_FOREGROUND_SCALE = 0.05;
  const MAX_FOREGROUND_SCALE = 12;

  let {
    open = false,
    card,
    cdbPath = "",
    onSavedJpg = async () => {},
    onClose = () => {},
  }: {
    open?: boolean;
    card: CardDataEntry;
    cdbPath?: string;
    onSavedJpg?: () => void | Promise<void>;
    onClose?: () => void;
  } = $props();

  let form = $state<CardImageFormData>(normalizeCardImageFormData({}));
  let previewHost = $state<HTMLDivElement | null>(null);
  let previewShell = $state<HTMLDivElement | null>(null);
  let previewCard = $state<InstanceType<YugiohCardConstructor> | null>(null);
  let fileInput = $state<HTMLInputElement | null>(null);
  let foregroundFileInput = $state<HTMLInputElement | null>(null);
  let foregroundEditorOpen = $state(false);
  let foregroundPreviewHost = $state<HTMLDivElement | null>(null);
  let foregroundPreviewShell = $state<HTMLDivElement | null>(null);
  let foregroundPreviewCard = $state<InstanceType<YugiohCardConstructor> | null>(null);
  let cropImageElement = $state<HTMLImageElement | null>(null);
  let croppedImageDataUrl = $state("");
  let sourceImageUrl = $state("");
  let sourceImageWidth = $state(0);
  let sourceImageHeight = $state(0);
  let cropModalOpen = $state(false);
  let cropBox = $state<CropBox>({ x: 0, y: 0, size: 0 });
  let dragMode = $state<DragMode>(null);
  let dragPointerId = $state<number | null>(null);
  let dragStartX = $state(0);
  let dragStartY = $state(0);
  let dragStartBox = $state<CropBox>({ x: 0, y: 0, size: 0 });
  let previewWidth = $state(360);
  let previewHeight = $state(640);
  let foregroundPreviewWidth = $state(420);
  let foregroundPreviewHeight = $state(680);
  let foregroundRenderWidth = $state(FOREGROUND_EDITOR_CARD_WIDTH);
  let foregroundRenderHeight = $state(FOREGROUND_EDITOR_CARD_HEIGHT);
  let foregroundRenderOffsetX = $state(0);
  let foregroundRenderOffsetY = $state(0);
  let previewZoomPercent = $state(DEFAULT_PREVIEW_ZOOM_PERCENT);
  let hasManualPreviewZoom = $state(false);
  let exportScalePercent = $state(DEFAULT_EXPORT_SCALE_PERCENT);
  let isDownloading = $state(false);
  let isSavingJpg = $state(false);
  let isTranslating = $state(false);
  let errorMessage = $state("");
  let lastHydrationKey = "";
  let lastFormLanguage = $state<CardImageLanguage>("sc");
  let previewTimer: ReturnType<typeof setTimeout> | null = null;
  let previewWarmupTimer: ReturnType<typeof setTimeout> | null = null;
  let previewFontsReady = $state(false);
  let foregroundPreviewTimer: ReturnType<typeof setTimeout> | null = null;
  let foregroundResizeObserver: ResizeObserver | null = null;
  let foregroundDragMode = $state<ForegroundEditorMode>(null);
  let foregroundDragPointerId = $state<number | null>(null);
  let foregroundDragStartX = $state(0);
  let foregroundDragStartY = $state(0);
  let foregroundDragStartForegroundX = $state(0);
  let foregroundDragStartForegroundY = $state(0);
  let foregroundDragStartForegroundScale = $state(1);
  let foregroundDragStartForegroundRotation = $state(0);
  let foregroundDragStartAngle = $state(0);
  let foregroundDragStartDistance = $state(1);
  let foregroundDragCenterClientX = $state(0);
  let foregroundDragCenterClientY = $state(0);
  let initialForegroundState = $state<ForegroundInitialState | null>(null);

  let yugiohCardConstructorPromise: Promise<YugiohCardConstructor> | null = null;
  let resourcePathPromise: Promise<string> | null = null;
  let previewResizeObserver: ResizeObserver | null = null;

  async function getResourcePath() {
    if (!tauriBridge.isTauri()) {
      return `${window.location.origin}/resources/yugioh-card`;
    }

    if (!resourcePathPromise) {
      resourcePathPromise = tauriBridge.resolveResource("resources/yugioh-card")
        .then((path) => toMediaProtocolSrc(path))
        .catch((error) => {
          console.error("Failed to resolve yugioh-card resource path", error);
          resourcePathPromise = null;
          return `${window.location.origin}/resources/yugioh-card`;
        });
    }

    return resourcePathPromise;
  }

  async function getYugiohCardConstructor(): Promise<YugiohCardConstructor> {
    if (!yugiohCardConstructorPromise) {
      yugiohCardConstructorPromise = import("yugioh-card").then((module) => module.YugiohCard as YugiohCardConstructor);
    }
    return yugiohCardConstructorPromise;
  }

  function destroyPreview() {
    previewCard?.leafer?.destroy?.();
    previewCard = null;
    if (previewHost) {
      previewHost.innerHTML = "";
    }
  }

  function destroyForegroundPreview() {
    foregroundPreviewCard?.leafer?.destroy?.();
    foregroundPreviewCard = null;
    if (foregroundPreviewHost) {
      foregroundPreviewHost.innerHTML = "";
    }
  }

  function revokeSourceImageUrl() {
    if (sourceImageUrl) {
      URL.revokeObjectURL(sourceImageUrl);
      sourceImageUrl = "";
    }
  }

  function closeDrawer() {
    onClose();
  }

  function isPositiveCardCode(value: unknown) {
    return Number.isInteger(Number(value)) && Number(value) > 0;
  }

  function resetImageState() {
    croppedImageDataUrl = "";
    sourceImageWidth = 0;
    sourceImageHeight = 0;
    cropModalOpen = false;
    cropBox = { x: 0, y: 0, size: 0 };
    dragMode = null;
    dragPointerId = null;
    hasManualPreviewZoom = false;
    previewZoomPercent = DEFAULT_PREVIEW_ZOOM_PERCENT;
    exportScalePercent = DEFAULT_EXPORT_SCALE_PERCENT;
    revokeSourceImageUrl();
  }

  function resetForegroundState() {
    foregroundEditorOpen = false;
    foregroundDragMode = null;
    foregroundDragPointerId = null;
  }

  function clearForegroundInitialState() {
    initialForegroundState = null;
  }

  function openFilePicker() {
    fileInput?.click();
  }

  function openForegroundFilePicker() {
    foregroundFileInput?.click();
  }

  function getForegroundEditorScale() {
    if (!foregroundPreviewWidth || !foregroundPreviewHeight) {
      return 0.32;
    }

    const availableWidth = Math.max(foregroundPreviewWidth - FOREGROUND_EDITOR_PADDING * 2, 1);
    const availableHeight = Math.max(foregroundPreviewHeight - FOREGROUND_EDITOR_PADDING * 2, 1);
    return Math.min(availableWidth / FOREGROUND_EDITOR_CARD_WIDTH, availableHeight / FOREGROUND_EDITOR_CARD_HEIGHT);
  }

  function clampForegroundScale(scale: number) {
    return Math.max(MIN_FOREGROUND_SCALE, Math.min(MAX_FOREGROUND_SCALE, scale));
  }

  function getForegroundSelectionWidth() {
    return Math.max(0, form.foregroundWidth * form.foregroundScale);
  }

  function getForegroundSelectionHeight() {
    return Math.max(0, form.foregroundHeight * form.foregroundScale);
  }

  function hasForegroundImage() {
    return Boolean(form.foregroundImage && form.foregroundWidth > 0 && form.foregroundHeight > 0);
  }

  function getForegroundSelectionStyle() {
    const renderScaleX = foregroundRenderWidth > 0 ? foregroundRenderWidth / FOREGROUND_EDITOR_CARD_WIDTH : 1;
    const renderScaleY = foregroundRenderHeight > 0 ? foregroundRenderHeight / FOREGROUND_EDITOR_CARD_HEIGHT : 1;
    const width = getForegroundSelectionWidth();
    const height = getForegroundSelectionHeight();
    return [
      `left:${foregroundRenderOffsetX + (form.foregroundX - width / 2) * renderScaleX}px`,
      `top:${foregroundRenderOffsetY + (form.foregroundY - height / 2) * renderScaleY}px`,
      `width:${width * renderScaleX}px`,
      `height:${height * renderScaleY}px`,
      `transform:rotate(${form.foregroundRotation}deg)`,
    ].join(";");
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
    if (!hasForegroundImage() || !initialForegroundState) return;

    form = normalizeCardImageFormData({
      ...form,
      foregroundWidth: initialForegroundState.foregroundWidth,
      foregroundHeight: initialForegroundState.foregroundHeight,
      foregroundX: initialForegroundState.foregroundX,
      foregroundY: initialForegroundState.foregroundY,
      foregroundScale: initialForegroundState.foregroundScale,
      foregroundRotation: initialForegroundState.foregroundRotation,
    });
  }

  function clearForegroundImage() {
    clearForegroundInitialState();
    form = normalizeCardImageFormData({
      ...form,
      foregroundImage: "",
      foregroundWidth: 0,
      foregroundHeight: 0,
      foregroundScale: 1,
      foregroundRotation: 0,
      foregroundX: FOREGROUND_EDITOR_CARD_WIDTH / 2,
      foregroundY: FOREGROUND_EDITOR_CARD_HEIGHT / 2,
    });
  }

  function clearCustomNameColor() {
    form = normalizeCardImageFormData({
      ...form,
      color: "",
      gradient: false,
      gradientColor1: "#999999",
      gradientColor2: "#ffffff",
    });
  }

  function clearCustomNameShadowColor() {
    form = normalizeCardImageFormData({
      ...form,
      nameShadowColor: "",
      nameShadowGradient: false,
      nameShadowGradientColor1: "#1f2937",
      nameShadowGradientColor2: "#0f172a",
    });
  }

  function getOptionLabel(option: LabelOption) {
    if (option.labelKey) return $_(option.labelKey);
    return option.label ?? option.value;
  }

  async function ensureAiReady() {
    if (!HAS_AI_FEATURE) {
      return false;
    }

    try {
      await createAiAppContext().getAiConfig();
      return true;
    } catch {
      await tauriBridge.message($_("editor.ai_requires_secret_key"), {
        title: $_("editor.ai_requires_secret_key_title"),
        kind: "warning",
      });
      return false;
    }
  }

  async function handleAiTranslate() {
    if (!(await ensureAiReady())) return;

    if (!form.name.trim() && !form.monsterType.trim() && !form.description.trim() && !form.pendulumDescription.trim()) {
      showToast($_("editor.card_image_ai_translate_empty"), "info");
      return;
    }

    try {
      isTranslating = true;
      const { translateCardImageFields } = await import("$lib/utils/ai");
      const targetLanguageLabel = getOptionLabel(
        CARD_IMAGE_LANGUAGE_OPTIONS.find((option) => option.value === form.language) ?? {
          value: form.language,
          label: form.language,
        },
      );
      const translated = await translateCardImageFields({
        context: createAiAppContext(),
        currentCard: card,
        targetLanguage: targetLanguageLabel,
        name: form.name,
        monsterType: form.monsterType,
        description: form.description,
        pendulumDescription: form.pendulumDescription,
      });

      form = normalizeCardImageFormData({
        ...form,
        name: translated.name ?? form.name,
        monsterType: translated.monsterType ?? form.monsterType,
        description: translated.description ?? form.description,
        pendulumDescription: translated.pendulumDescription ?? form.pendulumDescription,
      });
      showToast($_("editor.card_image_ai_translate_success"), "success");
    } catch (error) {
      console.error("Failed to translate card image fields", error);
      void writeErrorLog({
        source: "card-image.ai.translate",
        error,
        extra: {
          cardCode: card.code ?? 0,
          targetLanguage: form.language,
        },
      });
      showToast($_("editor.card_image_ai_translate_failed"), "error");
    } finally {
      isTranslating = false;
    }
  }

  function clampCropBox(nextBox: CropBox): CropBox {
    const imageWidth = cropImageElement?.clientWidth ?? 0;
    const imageHeight = cropImageElement?.clientHeight ?? 0;
    if (!imageWidth || !imageHeight) return nextBox;

    const maxSize = Math.min(imageWidth, imageHeight);
    const size = Math.min(Math.max(nextBox.size, MIN_CROP_SIZE), maxSize);
    const x = Math.min(Math.max(nextBox.x, 0), Math.max(imageWidth - size, 0));
    const y = Math.min(Math.max(nextBox.y, 0), Math.max(imageHeight - size, 0));

    return { x, y, size };
  }

  function initializeCropBox() {
    const imageWidth = cropImageElement?.clientWidth ?? 0;
    const imageHeight = cropImageElement?.clientHeight ?? 0;
    if (!imageWidth || !imageHeight) return;

    const size = Math.max(MIN_CROP_SIZE, Math.min(imageWidth, imageHeight) * 0.72);
    cropBox = {
      x: (imageWidth - size) / 2,
      y: (imageHeight - size) / 2,
      size,
    };
  }

  async function handleImageUpload(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    revokeSourceImageUrl();
    sourceImageUrl = URL.createObjectURL(file);

    const image = new Image();
    image.src = sourceImageUrl;
    await image.decode();
    sourceImageWidth = image.naturalWidth;
    sourceImageHeight = image.naturalHeight;
    cropModalOpen = true;

    await tick();
    requestAnimationFrame(() => {
      initializeCropBox();
    });

    input.value = "";
  }

  async function readFileAsDataUrl(file: File) {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(reader.error ?? new Error("File read failed"));
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

    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
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

    const trimmedCanvas = document.createElement("canvas");
    trimmedCanvas.width = trimmedWidth;
    trimmedCanvas.height = trimmedHeight;
    const trimmedContext = trimmedCanvas.getContext("2d");
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
      dataUrl: trimmedCanvas.toDataURL("image/png"),
      width: trimmedWidth,
      height: trimmedHeight,
    };
  }

  async function handleForegroundImageUpload(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const uploaded = await trimTransparentImage((await readFileAsDataUrl(file)).dataUrl);
      const isReplacing = hasForegroundImage();
      const nextInitialState: ForegroundInitialState = {
        foregroundWidth: uploaded.width,
        foregroundHeight: uploaded.height,
        foregroundX: isReplacing ? form.foregroundX : FOREGROUND_EDITOR_CARD_WIDTH / 2,
        foregroundY: isReplacing ? form.foregroundY : FOREGROUND_EDITOR_CARD_HEIGHT / 2,
        foregroundScale: isReplacing ? form.foregroundScale : getDefaultForegroundScale(uploaded.width, uploaded.height),
        foregroundRotation: isReplacing ? form.foregroundRotation : 0,
      };
      initialForegroundState = nextInitialState;
      form = normalizeCardImageFormData({
        ...form,
        foregroundImage: uploaded.dataUrl,
        foregroundWidth: nextInitialState.foregroundWidth,
        foregroundHeight: nextInitialState.foregroundHeight,
        foregroundX: nextInitialState.foregroundX,
        foregroundY: nextInitialState.foregroundY,
        foregroundScale: nextInitialState.foregroundScale,
        foregroundRotation: nextInitialState.foregroundRotation,
      });
    } catch (error) {
      console.error("Failed to upload foreground image", error);
      showToast($_("editor.card_image_foreground_upload_failed"), "error");
    } finally {
      input.value = "";
    }
  }

  async function applyCrop() {
    if (!cropImageElement || !sourceImageUrl || !sourceImageWidth || !sourceImageHeight) return;

    const displayWidth = cropImageElement.clientWidth;
    const displayHeight = cropImageElement.clientHeight;
    if (!displayWidth || !displayHeight) return;

    const scaleX = sourceImageWidth / displayWidth;
    const scaleY = sourceImageHeight / displayHeight;

    const canvas = document.createElement("canvas");
    canvas.width = CROPPED_IMAGE_SIZE;
    canvas.height = CROPPED_IMAGE_SIZE;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas context unavailable");
    }

    const image = new Image();
    image.src = sourceImageUrl;
    await image.decode();

    context.clearRect(0, 0, CROPPED_IMAGE_SIZE, CROPPED_IMAGE_SIZE);
    context.drawImage(
      image,
      cropBox.x * scaleX,
      cropBox.y * scaleY,
      cropBox.size * scaleX,
      cropBox.size * scaleY,
      0,
      0,
      CROPPED_IMAGE_SIZE,
      CROPPED_IMAGE_SIZE,
    );

    croppedImageDataUrl = canvas.toDataURL("image/png");
    form.image = croppedImageDataUrl;
    cropModalOpen = false;
  }

  function cancelCrop() {
    if (!croppedImageDataUrl) {
      revokeSourceImageUrl();
      sourceImageWidth = 0;
      sourceImageHeight = 0;
    }
    cropModalOpen = false;
    dragMode = null;
    dragPointerId = null;
  }

  function handleCropPointerDown(event: PointerEvent) {
    dragMode = "move";
    dragPointerId = event.pointerId;
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    dragStartBox = { ...cropBox };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function handleCropResizePointerDown(event: PointerEvent) {
    event.stopPropagation();
    dragMode = "resize";
    dragPointerId = event.pointerId;
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    dragStartBox = { ...cropBox };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function handleCropPointerMove(event: PointerEvent) {
    if (!dragMode || dragPointerId !== event.pointerId) return;

    const dx = event.clientX - dragStartX;
    const dy = event.clientY - dragStartY;

    if (dragMode === "move") {
      cropBox = clampCropBox({
        x: dragStartBox.x + dx,
        y: dragStartBox.y + dy,
        size: dragStartBox.size,
      });
      return;
    }

    cropBox = clampCropBox({
      x: dragStartBox.x,
      y: dragStartBox.y,
      size: dragStartBox.size + Math.max(dx, dy),
    });
  }

  function handleCropPointerUp(event: PointerEvent) {
    if (dragPointerId !== event.pointerId) return;
    dragMode = null;
    dragPointerId = null;
  }

  function handleCropWheel(event: WheelEvent) {
    event.preventDefault();
    const delta = Math.sign(event.deltaY) * 20;
    const centerX = cropBox.x + cropBox.size / 2;
    const centerY = cropBox.y + cropBox.size / 2;
    const nextSize = cropBox.size - delta;
    cropBox = clampCropBox({
      x: centerX - nextSize / 2,
      y: centerY - nextSize / 2,
      size: nextSize,
    });
  }

  function getAutoPreviewZoomPercent() {
    if (!previewWidth || !previewHeight) {
      return DEFAULT_PREVIEW_ZOOM_PERCENT;
    }

    const widthRatio = previewWidth / PREVIEW_ZOOM_REFERENCE_WIDTH;
    const heightRatio = previewHeight / PREVIEW_ZOOM_REFERENCE_HEIGHT;
    const scaledPercent = Math.min(widthRatio, heightRatio) * 100;

    return Math.round(
      Math.max(DEFAULT_PREVIEW_ZOOM_PERCENT, Math.min(MAX_PREVIEW_ZOOM_PERCENT, scaledPercent)),
    );
  }

  function getPreviewScale() {
    // Strictly fit the preview to the current container instead of clamping to
    // fixed fallback dimensions, so 720p and 4K screens scale proportionally.
    const availableWidth = Math.max(previewWidth - 16, 1);
    const availableHeight = Math.max(previewHeight - 40, 1);
    const baseScale = Math.min(availableWidth / CARD_WIDTH, availableHeight / CARD_HEIGHT);
    return Math.max(baseScale * (previewZoomPercent / 100), 0.02);
  }

  function applyAutoRarityStyle(data: CardImageFormData): CardImageFormData {
    const rarity = String(data.rare ?? "").trim().toLowerCase();
    if (!rarity || data.color || data.gradient) {
      return data;
    }

    const styleMap: Record<string, Pick<CardImageFormData, "color" | "gradient" | "gradientColor1" | "gradientColor2">> = {
      ur: {
        color: "#f3cc63",
        gradient: true,
        gradientColor1: "#8a5d17",
        gradientColor2: "#f8e6a2",
      },
      gr: {
        color: "#d8dde6",
        gradient: true,
        gradientColor1: "#6d7683",
        gradientColor2: "#f4f7fb",
      },
      hr: {
        color: "#eef2f8",
        gradient: true,
        gradientColor1: "#8e99a9",
        gradientColor2: "#ffffff",
      },
      ser: {
        color: "#edf2f8",
        gradient: true,
        gradientColor1: "#8b95a4",
        gradientColor2: "#ffffff",
      },
      gser: {
        color: "#f1d377",
        gradient: true,
        gradientColor1: "#8a6422",
        gradientColor2: "#fff1be",
      },
      pser: {
        color: "#f5d6ef",
        gradient: true,
        gradientColor1: "#855f86",
        gradientColor2: "#fff5fd",
      },
    };

    const style = styleMap[rarity];
    return style ? { ...data, ...style } : data;
  }

  function buildPreviewData(): CardImageFormData {
    return applyAutoRarityStyle(normalizeCardImageFormData({
      ...form,
      image: croppedImageDataUrl,
      scale: Math.max(getPreviewScale(), 0.1),
    }));
  }

  function buildJpgData(): CardImageFormData {
    return applyAutoRarityStyle(normalizeCardImageFormData({
      ...form,
      image: croppedImageDataUrl,
      scale: exportScalePercent / 100,
    }));
  }

  function buildPngData(): CardImageFormData {
    return applyAutoRarityStyle(normalizeCardImageFormData({
      ...form,
      image: croppedImageDataUrl,
      scale: 1,
    }));
  }

  function buildForegroundPreviewData(): CardImageFormData {
    return applyAutoRarityStyle(normalizeCardImageFormData({
      ...form,
      image: croppedImageDataUrl,
      scale: 1,
    }));
  }

  function isFieldSpellCard(data: CardImageFormData) {
    return data.type === "spell" && data.icon === "field";
  }

  async function renderSquareJpgBlob(dataUrl: string, size: number, quality = 0.92) {
    const image = new Image();
    image.src = dataUrl;
    await image.decode();

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas context unavailable");
    }

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.clearRect(0, 0, size, size);
    context.drawImage(image, 0, 0, size, size);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", quality);
    });
    if (blob) {
      return blob;
    }

    const fallbackResponse = await fetch(canvas.toDataURL("image/jpeg", quality));
    return await fallbackResponse.blob();
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
    hasManualPreviewZoom = true;
    const stepSize = event.ctrlKey || event.metaKey ? 8 : 5;
    const step = event.deltaY < 0 ? stepSize : -stepSize;
    previewZoomPercent = Math.max(
      MIN_PREVIEW_ZOOM_PERCENT,
      Math.min(MAX_PREVIEW_ZOOM_PERCENT, previewZoomPercent + step),
    );
  }

  function trackPreviewDependencies() {
    void form.language;
    void form.font;
    void form.name;
    void form.color;
    void form.align;
    void form.gradient;
    void form.gradientColor1;
    void form.gradientColor2;
    void form.type;
    void form.attribute;
    void form.icon;
    void form.cardType;
    void form.pendulumType;
    void form.level;
    void form.rank;
    void form.pendulumScale;
    void form.pendulumDescription;
    void form.monsterType;
    void form.atkBar;
    void form.atk;
    void form.def;
    void form.arrowList.length;
    void form.description;
    void form.firstLineCompress;
    void form.descriptionAlign;
    void form.descriptionZoom;
    void form.descriptionWeight;
    void form.package;
    void form.password;
    void form.copyright;
    void form.laser;
    void form.rare;
    void form.twentieth;
    void form.radius;
    void form.foregroundImage;
    void form.foregroundWidth;
    void form.foregroundHeight;
    void form.foregroundX;
    void form.foregroundY;
    void form.foregroundScale;
    void form.foregroundRotation;
    void form.effectBlockEnabled;
    void form.effectBlockX;
    void form.effectBlockY;
    void form.effectBlockWidth;
    void form.effectBlockHeight;
    void form.effectBlockColor;
    void form.effectBlockOpacity;
    void form.nameShadowColor;
    void form.nameShadowGradient;
    void form.nameShadowGradientColor1;
    void form.nameShadowGradientColor2;
    void croppedImageDataUrl;
    void previewWidth;
    void previewHeight;
    void previewZoomPercent;
    void foregroundPreviewWidth;
    void foregroundPreviewHeight;
    void foregroundRenderWidth;
    void foregroundRenderHeight;
    void foregroundRenderOffsetX;
    void foregroundRenderOffsetY;
  }

  async function renderCardBlob(
    data: CardImageFormData,
    type: "png" | "jpg",
    quality?: number,
  ) {
    const YugiohCard = await getYugiohCardConstructor();
    const host = document.createElement("div");
    host.style.position = "fixed";
    host.style.left = "-99999px";
    host.style.top = "0";
    document.body.appendChild(host);
    let exportCard: InstanceType<YugiohCardConstructor> | null = null;

    try {
      const resourcePath = await getResourcePath();
      exportCard = new YugiohCard({
        view: host,
        data,
        resourcePath,
      });

      await tick();
      applyEffectBlockOverlay(exportCard, data, resourcePath);
      applyNameLeafEnhancements(exportCard, data);
      if (!exportCard.leafer) {
        throw new Error("Export renderer unavailable");
      }

      const exported = await exportCard.leafer.export(type, {
        screenshot: true,
        pixelRatio: 1,
        blob: true,
        ...(quality !== undefined ? { quality } : {}),
      });
      const candidate = exported && typeof exported === "object" && "data" in exported
        ? (exported as { data: unknown }).data
        : exported;

      if (candidate instanceof Blob) {
        return candidate;
      }

      if (typeof candidate === "string") {
        const response = await fetch(candidate);
        return await response.blob();
      }

      throw new Error("Export did not return a Blob");
    } finally {
      exportCard?.leafer?.destroy?.();
      host.remove();
    }
  }

  async function blobToUint8Array(blob: Blob) {
    const arrayBuffer = await blob.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }

  async function ensurePreviewCard() {
    await tick();
    if (!open || !previewHost) return null;

    const YugiohCard = await getYugiohCardConstructor();
    if (!previewCard) {
      previewCard = new YugiohCard({
        view: previewHost,
        data: buildPreviewData(),
        resourcePath: await getResourcePath(),
      });
    }

    return previewCard;
  }

  async function ensureForegroundPreviewCard() {
    await tick();
    if (!open || !foregroundEditorOpen || !foregroundPreviewHost) return null;

    const YugiohCard = await getYugiohCardConstructor();
    if (!foregroundPreviewCard) {
      foregroundPreviewCard = new YugiohCard({
        view: foregroundPreviewHost,
        data: buildForegroundPreviewData(),
        resourcePath: await getResourcePath(),
      });
    }

    return foregroundPreviewCard;
  }

  async function refreshPreview() {
    if (!open || !previewHost || !previewFontsReady) return;

    try {
      errorMessage = "";
      const cardInstance = await ensurePreviewCard();
      const previewData = buildPreviewData();
      cardInstance?.setData?.(previewData);
      applyEffectBlockOverlay(cardInstance, previewData, await getResourcePath());
      applyNameLeafEnhancements(cardInstance, previewData);
    } catch (error) {
      console.error("Failed to refresh card image preview", error);
      errorMessage = $_("editor.card_image_generate_failed");
    }
  }

  async function refreshForegroundPreview() {
    if (!open || !foregroundEditorOpen || !foregroundPreviewHost || !previewFontsReady) return;

    try {
      const cardInstance = await ensureForegroundPreviewCard();
      const previewData = buildForegroundPreviewData();
      cardInstance?.setData?.(previewData);
      applyEffectBlockOverlay(cardInstance, previewData, await getResourcePath());
      applyNameLeafEnhancements(cardInstance, previewData);
      await tick();
      requestAnimationFrame(() => {
        measureForegroundRenderBounds();
      });
    } catch (error) {
      console.error("Failed to refresh foreground editor preview", error);
    }
  }

  async function warmupPreviewAfterFontsReady() {
    previewFontsReady = false;
    try {
      const fontSet = typeof document !== "undefined"
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
      previewFontsReady = true;
      destroyPreview();
      void refreshPreview();
    }, 100);
  }

  function getPointerAngle(clientX: number, clientY: number, centerX: number, centerY: number) {
    return Math.atan2(clientY - centerY, clientX - centerX) * 180 / Math.PI;
  }

  function measureForegroundRenderBounds() {
    if (!foregroundPreviewHost) return;

    const content = foregroundPreviewHost.firstElementChild as HTMLElement | null;
    const nextWidth = content?.clientWidth || foregroundPreviewHost.clientWidth || FOREGROUND_EDITOR_CARD_WIDTH;
    const nextHeight = content?.clientHeight || foregroundPreviewHost.clientHeight || FOREGROUND_EDITOR_CARD_HEIGHT;
    const nextOffsetX = content?.offsetLeft ?? 0;
    const nextOffsetY = content?.offsetTop ?? 0;

    foregroundRenderWidth = nextWidth;
    foregroundRenderHeight = nextHeight;
    foregroundRenderOffsetX = nextOffsetX;
    foregroundRenderOffsetY = nextOffsetY;
  }

  function stopForegroundInteraction() {
    foregroundDragMode = null;
    foregroundDragPointerId = null;
    window.removeEventListener("pointermove", handleForegroundPointerMove);
    window.removeEventListener("pointerup", handleForegroundPointerUp);
    window.removeEventListener("pointercancel", handleForegroundPointerUp);
  }

  function beginForegroundInteraction(event: PointerEvent, mode: ForegroundEditorMode) {
    if (!hasForegroundImage() || !foregroundPreviewHost) return;

    const selection = foregroundPreviewHost.parentElement?.querySelector<HTMLElement>(".foreground-selection") ?? null;
    const rect = selection?.getBoundingClientRect();
    const centerX = rect ? rect.left + rect.width / 2 : 0;
    const centerY = rect ? rect.top + rect.height / 2 : 0;

    event.preventDefault();
    event.stopPropagation();

    foregroundDragMode = mode;
    foregroundDragPointerId = event.pointerId;
    foregroundDragStartX = event.clientX;
    foregroundDragStartY = event.clientY;
    foregroundDragStartForegroundX = form.foregroundX;
    foregroundDragStartForegroundY = form.foregroundY;
    foregroundDragStartForegroundScale = form.foregroundScale;
    foregroundDragStartForegroundRotation = form.foregroundRotation;
    foregroundDragCenterClientX = centerX;
    foregroundDragCenterClientY = centerY;
    foregroundDragStartAngle = getPointerAngle(event.clientX, event.clientY, centerX, centerY);
    foregroundDragStartDistance = Math.max(Math.hypot(event.clientX - centerX, event.clientY - centerY), 1);

    window.addEventListener("pointermove", handleForegroundPointerMove);
    window.addEventListener("pointerup", handleForegroundPointerUp);
    window.addEventListener("pointercancel", handleForegroundPointerUp);
  }

  function handleForegroundMovePointerDown(event: PointerEvent) {
    beginForegroundInteraction(event, "move");
  }

  function handleForegroundScalePointerDown(event: PointerEvent) {
    beginForegroundInteraction(event, "scale");
  }

  function handleForegroundRotatePointerDown(event: PointerEvent) {
    beginForegroundInteraction(event, "rotate");
  }

  function handleForegroundPointerMove(event: PointerEvent) {
    if (foregroundDragPointerId !== event.pointerId || !foregroundDragMode) return;

    const editorScale = Math.max(getForegroundEditorScale(), 0.01);

    if (foregroundDragMode === "move") {
      form = normalizeCardImageFormData({
        ...form,
        foregroundX: foregroundDragStartForegroundX + (event.clientX - foregroundDragStartX) / editorScale,
        foregroundY: foregroundDragStartForegroundY + (event.clientY - foregroundDragStartY) / editorScale,
      });
      return;
    }

    if (foregroundDragMode === "scale") {
      const currentDistance = Math.max(
        Math.hypot(event.clientX - foregroundDragCenterClientX, event.clientY - foregroundDragCenterClientY),
        1,
      );
      form = normalizeCardImageFormData({
        ...form,
        foregroundScale: clampForegroundScale(
          foregroundDragStartForegroundScale * (currentDistance / foregroundDragStartDistance),
        ),
      });
      return;
    }

    const nextAngle = getPointerAngle(
      event.clientX,
      event.clientY,
      foregroundDragCenterClientX,
      foregroundDragCenterClientY,
    );
    form = normalizeCardImageFormData({
      ...form,
      foregroundRotation: foregroundDragStartForegroundRotation + (nextAngle - foregroundDragStartAngle),
    });
  }

  function handleForegroundPointerUp(event: PointerEvent) {
    if (foregroundDragPointerId !== event.pointerId) return;
    stopForegroundInteraction();
  }

  async function handleDownload() {
    isDownloading = true;

    try {
      const pngBlob = await renderCardBlob(buildPngData(), "png");

      const targetPath = await tauriBridge.save({
        defaultPath: `${form.password || card.code || "card"}.png`,
        filters: [{ name: "PNG", extensions: ["png"] }],
      });
      if (!targetPath) return;

      const bytes = await blobToUint8Array(pngBlob);
      await writeBinaryFile(targetPath, Array.from(bytes));
      showToast($_("editor.card_image_download_success"), "success");
    } catch (error) {
      console.error("Failed to download generated card image", error);
      showToast($_("editor.card_image_download_failed"), "error");
    } finally {
      isDownloading = false;
    }
  }

  async function handleSaveJpg() {
    if (!cdbPath) {
      showToast($_("editor.card_image_save_jpg_missing_cdb"), "error");
      return;
    }

    if (!isPositiveCardCode(card.code)) {
      showToast($_("editor.code_required"), "error");
      return;
    }

    isSavingJpg = true;

    try {
      const picsDir = await getPicsDir(cdbPath);
      const picPath = await tauriBridge.join(picsDir, `${card.code}.jpg`);
      const fieldPicPath = await tauriBridge.join(picsDir, "field", `${card.code}.jpg`);
      const jpgData = buildJpgData();

      let shouldOverwrite = true;
      if (await pathExists(picPath)) {
        shouldOverwrite = await tauriBridge.ask($_("editor.card_image_save_jpg_overwrite_confirm", {
          values: { code: String(card.code) },
        }), {
          title: $_("editor.card_image_save_jpg_overwrite_title"),
          kind: "warning",
        });
      }

      if (!shouldOverwrite) return;

      const jpgBlob = await renderCardBlob(jpgData, "jpg", 0.92);
      const bytes = await blobToUint8Array(jpgBlob);

      let fieldArtBytes: Uint8Array | null = null;
      if (isFieldSpellCard(jpgData) && croppedImageDataUrl) {
        const fieldArtBlob = await renderSquareJpgBlob(croppedImageDataUrl, FIELD_SPELL_ART_SIZE, 0.92);
        fieldArtBytes = await blobToUint8Array(fieldArtBlob);
      }

      await writeBinaryFile(picPath, Array.from(bytes));
      if (fieldArtBytes) {
        await writeBinaryFile(fieldPicPath, Array.from(fieldArtBytes));
      }
      await onSavedJpg();
      showToast($_("editor.card_image_save_jpg_success", {
        values: { code: String(card.code) },
      }), "success");
    } catch (error) {
      console.error("Failed to save rendered JPG to pics", error);
      showToast($_("editor.card_image_save_jpg_failed"), "error");
    } finally {
      isSavingJpg = false;
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
          card.strings?.join("|") ?? "",
        ].join("::")
      : "";

    if (!open) {
      lastHydrationKey = "";
      errorMessage = "";
      previewFontsReady = false;
      destroyPreview();
      destroyForegroundPreview();
      resetImageState();
      resetForegroundState();
      clearForegroundInitialState();
      return;
    }

    if (hydrationKey !== lastHydrationKey) {
      lastHydrationKey = hydrationKey;
      form = createCardImageFormData(card);
      lastFormLanguage = form.language;
      resetImageState();
      resetForegroundState();
      clearForegroundInitialState();
      destroyPreview();
      destroyForegroundPreview();
      void warmupPreviewAfterFontsReady();
    }
  });

  $effect(() => {
    if (!open) return;

    const currentLanguage = form.language as CardImageLanguage;
    if (currentLanguage === lastFormLanguage) return;

    const previousDefaults = getCardImageLocaleDefaults(card, lastFormLanguage);
    const nextDefaults = getCardImageLocaleDefaults(card, currentLanguage);

    form = normalizeCardImageFormData({
      ...form,
      monsterType: form.monsterType === previousDefaults.monsterType ? nextDefaults.monsterType : form.monsterType,
      description: form.description === previousDefaults.description ? nextDefaults.description : form.description,
      pendulumDescription: form.pendulumDescription === previousDefaults.pendulumDescription
        ? nextDefaults.pendulumDescription
        : form.pendulumDescription,
      copyright: form.copyright === previousDefaults.copyright ? nextDefaults.copyright : form.copyright,
    });
    lastFormLanguage = currentLanguage;
  });

  $effect(() => {
    if (!previewShell) return;

    previewResizeObserver?.disconnect();
    previewResizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      previewWidth = entry.contentRect.width;
      previewHeight = entry.contentRect.height;
    });
    previewResizeObserver.observe(previewShell);

    return () => {
      previewResizeObserver?.disconnect();
      previewResizeObserver = null;
    };
  });

  $effect(() => {
    if (!foregroundPreviewShell || !foregroundEditorOpen) return;

    foregroundResizeObserver?.disconnect();
    foregroundResizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      foregroundPreviewWidth = entry.contentRect.width;
      foregroundPreviewHeight = entry.contentRect.height;
      measureForegroundRenderBounds();
    });
    foregroundResizeObserver.observe(foregroundPreviewShell);

    return () => {
      foregroundResizeObserver?.disconnect();
      foregroundResizeObserver = null;
    };
  });

  $effect(() => {
    if (!open || hasManualPreviewZoom) return;
    if (!previewWidth || !previewHeight) return;

    const nextZoomPercent = getAutoPreviewZoomPercent();
    if (previewZoomPercent === nextZoomPercent) return;
    previewZoomPercent = nextZoomPercent;
  });

  $effect(() => {
    if (!open) return;

    trackPreviewDependencies();

    clearTimeout(previewTimer ?? undefined);
    previewTimer = setTimeout(() => {
      void refreshPreview();
      if (foregroundEditorOpen) {
        void refreshForegroundPreview();
      }
    }, 40);

    return () => {
      clearTimeout(previewTimer ?? undefined);
      previewTimer = null;
    };
  });

  $effect(() => {
    if (!foregroundEditorOpen) {
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
      clearTimeout(foregroundPreviewTimer ?? undefined);
      destroyPreview();
      destroyForegroundPreview();
      previewResizeObserver?.disconnect();
      foregroundResizeObserver?.disconnect();
      revokeSourceImageUrl();
      stopForegroundInteraction();
    };
  });
</script>

{#if open}
  <div class="drawer-backdrop" role="presentation" onclick={handleBackdropClick}>
    <div class="drawer-panel" role="dialog" aria-modal="true" aria-label={$_("editor.card_image_title")}>
      <div class="drawer-header">
        <div>
          <h3>{$_("editor.card_image_title")}</h3>
          <p>{$_("editor.card_image_description")}</p>
        </div>
        <button class="close-btn" type="button" onclick={closeDrawer}>×</button>
      </div>

      <div class="drawer-body">
        <div class="form-pane">
          <div class="form-toolbar">
            <input class="sr-only" type="file" accept="image/png,image/jpeg,image/webp" bind:this={fileInput} onchange={handleImageUpload} />
            <input class="sr-only" type="file" accept="image/png,image/webp" bind:this={foregroundFileInput} onchange={handleForegroundImageUpload} />
            <button class="btn-primary btn-sm upload-btn" type="button" onclick={openFilePicker}>
              {croppedImageDataUrl ? $_("editor.card_image_recrop") : $_("editor.card_image_upload")}
            </button>
            <button class="btn-secondary btn-sm" type="button" onclick={() => foregroundEditorOpen = true}>
              {$_("editor.card_image_foreground_button")}
            </button>
            {#if HAS_AI_FEATURE}
              <button class="btn-secondary btn-sm" type="button" onclick={handleAiTranslate} disabled={isTranslating}>
                {isTranslating ? $_("editor.ai_translating") : $_("editor.card_image_ai_translate")}
              </button>
            {/if}
            <span class="field-hint">
              {#if croppedImageDataUrl}
                {$_("editor.card_image_ready")}
              {:else}
                {$_("editor.card_image_upload_hint")}
              {/if}
            </span>
          </div>

          <section class="drawer-section">
            <div class="section-title">{$_("editor.card_image_form_basic")}</div>
            <div class="field-grid">
              <label class="field"><span>{$_("editor.name")}</span><input type="text" bind:value={form.name} /></label>
              <label class="field"><span>{$_("editor.card_image_language")}</span><select bind:value={form.language}>{#each CARD_IMAGE_LANGUAGE_OPTIONS as option}<option value={option.value}>{getOptionLabel(option)}</option>{/each}</select></label>
              <label class="field"><span>{$_("editor.card_image_type")}</span><select bind:value={form.type}>{#each CARD_IMAGE_TYPE_OPTIONS as option}<option value={option.value}>{getOptionLabel(option)}</option>{/each}</select></label>
              <label class="field"><span>{$_("editor.card_image_card_type")}</span><select bind:value={form.cardType}>{#each CARD_IMAGE_CARD_TYPE_OPTIONS as option}<option value={option.value}>{getOptionLabel(option)}</option>{/each}</select></label>

              {#if form.type === "pendulum"}
                <label class="field"><span>{$_("editor.card_image_pendulum_type")}</span><select bind:value={form.pendulumType}>{#each CARD_IMAGE_PENDULUM_TYPE_OPTIONS as option}<option value={option.value}>{getOptionLabel(option)}</option>{/each}</select></label>
              {/if}

              {#if form.type === "monster" || form.type === "pendulum"}
                <label class="field"><span>{$_("editor.attribute")}</span><select bind:value={form.attribute}>{#each CARD_IMAGE_ATTRIBUTE_OPTIONS as option}<option value={option.value}>{getOptionLabel(option)}</option>{/each}</select></label>
                <label class="field"><span>{$_("editor.card_image_monster_type")}</span><input type="text" bind:value={form.monsterType} /></label>

                {#if form.type === "pendulum" ? form.pendulumType === "xyz-pendulum" : form.cardType === "xyz"}
                  <label class="field"><span>{$_("editor.level")}</span><input type="number" min="0" bind:value={form.rank} /></label>
                {:else if form.type === "pendulum" ? form.pendulumType !== "link-pendulum" : form.cardType !== "link"}
                  <label class="field"><span>{$_("editor.level")}</span><input type="number" min="0" bind:value={form.level} /></label>
                {/if}

                {#if form.type === "pendulum"}
                  <label class="field"><span>{$_("editor.scale")}</span><input type="number" min="0" max="13" bind:value={form.pendulumScale} /></label>
                {/if}

                <label class="field"><span>{$_("editor.atk")}</span><input type="number" bind:value={form.atk} /></label>
                {#if form.type === "pendulum" ? form.pendulumType !== "link-pendulum" : form.cardType !== "link"}
                  <label class="field"><span>{$_("editor.def")}</span><input type="number" bind:value={form.def} /></label>
                {/if}
              {/if}

              {#if form.type === "spell" || form.type === "trap"}
                <label class="field"><span>{$_("editor.card_image_icon")}</span><select bind:value={form.icon}>{#each CARD_IMAGE_ICON_OPTIONS as option}<option value={option.value}>{getOptionLabel(option)}</option>{/each}</select></label>
              {/if}
            </div>
          </section>

          <section class="drawer-section">
            <div class="section-title">{$_("editor.card_image_form_text")}</div>
            <div class="field-stack">
              <label class="field"><span>{$_("editor.desc")}</span><textarea rows="7" bind:value={form.description}></textarea></label>
              {#if form.type === "pendulum"}
                <label class="field"><span>{$_("editor.card_image_pendulum_text")}</span><textarea rows="4" bind:value={form.pendulumDescription}></textarea></label>
              {/if}
            </div>
          </section>

          <section class="drawer-section">
            <div class="section-title">{$_("editor.card_image_form_style")}</div>
            <div class="field-grid">
              <label class="field"><span>{$_("editor.card_image_font")}</span><select bind:value={form.font}>{#each CARD_IMAGE_FONT_OPTIONS as option}<option value={option.value}>{getOptionLabel(option)}</option>{/each}</select></label>
              <label class="field field-color">
                <span>{$_("editor.card_image_name_color")}</span>
                <div class="color-input-row">
                  <input
                    class="color-swatch"
                    type="color"
                    value={form.color || "#000000"}
                    onchange={(event) => {
                      form = normalizeCardImageFormData({
                        ...form,
                        color: (event.currentTarget as HTMLInputElement).value,
                      });
                    }}
                  />
                  <input type="text" placeholder={$_("editor.card_image_name_color_placeholder")} bind:value={form.color} />
                  <button class="btn-secondary btn-sm" type="button" onclick={clearCustomNameColor}>{$_("editor.card_image_name_color_reset")}</button>
                </div>
                <label class="toggle gradient-toggle"><input type="checkbox" bind:checked={form.gradient} /><span>{$_("editor.card_image_gradient_enable")}</span></label>
                {#if form.gradient}
                  <div class="subfield-grid">
                    <label class="field">
                      <span>{$_("editor.card_image_gradient_color_start")}</span>
                      <div class="color-input-row color-input-row-compact">
                        <input
                          class="color-swatch"
                          type="color"
                          value={form.gradientColor1 || "#999999"}
                          onchange={(event) => {
                            form = normalizeCardImageFormData({
                              ...form,
                              gradientColor1: (event.currentTarget as HTMLInputElement).value,
                            });
                          }}
                        />
                        <input type="text" bind:value={form.gradientColor1} />
                      </div>
                    </label>
                    <label class="field">
                      <span>{$_("editor.card_image_gradient_color_end")}</span>
                      <div class="color-input-row color-input-row-compact">
                        <input
                          class="color-swatch"
                          type="color"
                          value={form.gradientColor2 || "#ffffff"}
                          onchange={(event) => {
                            form = normalizeCardImageFormData({
                              ...form,
                              gradientColor2: (event.currentTarget as HTMLInputElement).value,
                            });
                          }}
                        />
                        <input type="text" bind:value={form.gradientColor2} />
                      </div>
                    </label>
                  </div>
                {/if}
                <small class="field-hint">{$_("editor.card_image_name_color_hint")}</small>
              </label>
              <label class="field field-color">
                <span>{$_("editor.card_image_name_shadow_color")}</span>
                <div class="color-input-row">
                  <input
                    class="color-swatch"
                    type="color"
                    value={form.nameShadowColor || "#111827"}
                    onchange={(event) => {
                      form = normalizeCardImageFormData({
                        ...form,
                        nameShadowColor: (event.currentTarget as HTMLInputElement).value,
                      });
                    }}
                  />
                  <input type="text" placeholder={$_("editor.card_image_name_color_placeholder")} bind:value={form.nameShadowColor} />
                  <button class="btn-secondary btn-sm" type="button" onclick={clearCustomNameShadowColor}>{$_("editor.card_image_name_color_reset")}</button>
                </div>
                <label class="toggle gradient-toggle"><input type="checkbox" bind:checked={form.nameShadowGradient} /><span>{$_("editor.card_image_gradient_enable")}</span></label>
                {#if form.nameShadowGradient}
                  <div class="subfield-grid">
                    <label class="field">
                      <span>{$_("editor.card_image_gradient_color_start")}</span>
                      <div class="color-input-row color-input-row-compact">
                        <input
                          class="color-swatch"
                          type="color"
                          value={form.nameShadowGradientColor1 || "#1f2937"}
                          onchange={(event) => {
                            form = normalizeCardImageFormData({
                              ...form,
                              nameShadowGradientColor1: (event.currentTarget as HTMLInputElement).value,
                            });
                          }}
                        />
                        <input type="text" bind:value={form.nameShadowGradientColor1} />
                      </div>
                    </label>
                    <label class="field">
                      <span>{$_("editor.card_image_gradient_color_end")}</span>
                      <div class="color-input-row color-input-row-compact">
                        <input
                          class="color-swatch"
                          type="color"
                          value={form.nameShadowGradientColor2 || "#0f172a"}
                          onchange={(event) => {
                            form = normalizeCardImageFormData({
                              ...form,
                              nameShadowGradientColor2: (event.currentTarget as HTMLInputElement).value,
                            });
                          }}
                        />
                        <input type="text" bind:value={form.nameShadowGradientColor2} />
                      </div>
                    </label>
                  </div>
                {/if}
                <small class="field-hint">{$_("editor.card_image_name_shadow_color_hint")}</small>
              </label>
              <label class="field"><span>{$_("editor.card_image_rarity")}</span><select bind:value={form.rare}>{#each CARD_IMAGE_RARE_OPTIONS as option}<option value={option.value}>{getOptionLabel(option)}</option>{/each}</select></label>
              <label class="field"><span>{$_("editor.card_image_laser")}</span><select bind:value={form.laser}>{#each CARD_IMAGE_LASER_OPTIONS as option}<option value={option.value}>{getOptionLabel(option)}</option>{/each}</select></label>
              <label class="field"><span>{$_("editor.card_image_copyright")}</span><select bind:value={form.copyright}>{#each CARD_IMAGE_COPYRIGHT_OPTIONS as option}<option value={option.value}>{getOptionLabel(option)}</option>{/each}</select></label>
              <label class="field"><span>{$_("editor.card_image_package")}</span><input type="text" bind:value={form.package} /></label>
              <label class="field"><span>{$_("editor.card_image_password")}</span><input type="text" bind:value={form.password} /></label>
              <label class="field field-span-2">
                <span>{$_("editor.card_image_export_scale", { values: { percent: String(exportScalePercent) } })}</span>
                <input type="range" min={MIN_EXPORT_SCALE_PERCENT} max={MAX_EXPORT_SCALE_PERCENT} step="1" bind:value={exportScalePercent} />
                <small class="field-hint">{$_("editor.card_image_export_scale_hint")}</small>
              </label>
              <label class="field"><span>{$_("editor.card_image_description_zoom")}</span><input type="number" min="0.5" step="0.1" bind:value={form.descriptionZoom} /></label>
              <label class="field"><span>{$_("editor.card_image_description_weight")}</span><input type="number" min="0" step="100" bind:value={form.descriptionWeight} /></label>
            </div>

            <div class="toggle-grid">
              <label class="toggle"><input type="checkbox" bind:checked={form.firstLineCompress} /><span>{$_("editor.card_image_first_line_compress")}</span></label>
              <label class="toggle"><input type="checkbox" bind:checked={form.descriptionAlign} /><span>{$_("editor.card_image_description_center")}</span></label>
              <label class="toggle"><input type="checkbox" bind:checked={form.twentieth} /><span>{$_("editor.card_image_twentieth")}</span></label>
              <label class="toggle"><input type="checkbox" bind:checked={form.radius} /><span>{$_("editor.card_image_round_corner")}</span></label>
            </div>
          </section>
        </div>

        <div class="preview-pane">
          <div class="preview-header">
            <div>
              <div class="section-title">{$_("editor.card_image_preview")}</div>
              <p>{$_("editor.card_image_preview_hint")}</p>
            </div>
            <div class="preview-actions">
              <button class="btn-secondary btn-sm" type="button" onclick={handleSaveJpg} disabled={isSavingJpg}>
                {isSavingJpg ? $_("editor.card_image_saving_jpg") : $_("editor.card_image_save_jpg")}
              </button>
              <button class="btn-secondary btn-sm" type="button" onclick={handleDownload} disabled={isDownloading}>
                {isDownloading ? $_("editor.card_image_downloading") : $_("editor.card_image_download")}
              </button>
            </div>
          </div>

          <div class="preview-card-shell" bind:this={previewShell} onwheel={handlePreviewWheel}>
            <div class="preview-stage" bind:this={previewHost}></div>
          </div>

          {#if errorMessage}
            <div class="preview-error">{errorMessage}</div>
          {/if}
        </div>
      </div>

      <div class="drawer-footer">
        <span class="field-hint">{$_("editor.card_image_live_preview")}</span>
        <button class="btn-primary btn-sm" type="button" onclick={closeDrawer}>{$_("editor.card_image_done")}</button>
      </div>
    </div>
  </div>
{/if}

{#if foregroundEditorOpen}
  <div class="foreground-backdrop" role="presentation" onclick={handleForegroundBackdropClick}>
    <div class="foreground-dialog" role="dialog" aria-modal="true" aria-label={$_("editor.card_image_foreground_title")}>
      <div class="foreground-header">
        <div>
          <h4>{$_("editor.card_image_foreground_title")}</h4>
          <p>{$_("editor.card_image_foreground_description")}</p>
        </div>
        <button class="close-btn" type="button" onclick={closeForegroundEditor}>×</button>
      </div>

      <div class="foreground-body">
        <section class="foreground-form">
          <div class="foreground-toolbar">
            <button class="btn-primary btn-sm" type="button" onclick={openForegroundFilePicker}>
              {hasForegroundImage() ? $_("editor.card_image_foreground_replace") : $_("editor.card_image_foreground_upload")}
            </button>
            <button class="btn-secondary btn-sm" type="button" onclick={resetForegroundTransform} disabled={!hasForegroundImage()}>
              {$_("editor.card_image_foreground_reset")}
            </button>
            <button class="btn-secondary btn-sm" type="button" onclick={clearForegroundImage} disabled={!hasForegroundImage()}>
              {$_("editor.card_image_foreground_clear")}
            </button>
          </div>

          <p class="field-hint">
            {#if hasForegroundImage()}
              {$_("editor.card_image_foreground_ready")}
            {:else}
              {$_("editor.card_image_foreground_empty")}
            {/if}
          </p>

          <div class="drawer-section foreground-section">
            <div class="section-title">{$_("editor.card_image_foreground_transform")}</div>
            <div class="field-grid">
              <label class="field"><span>{$_("editor.card_image_foreground_x")}</span><input type="number" step="1" bind:value={form.foregroundX} /></label>
              <label class="field"><span>{$_("editor.card_image_foreground_y")}</span><input type="number" step="1" bind:value={form.foregroundY} /></label>
              <label class="field"><span>{$_("editor.card_image_foreground_scale")}</span><input type="number" min={MIN_FOREGROUND_SCALE} max={MAX_FOREGROUND_SCALE} step="0.01" bind:value={form.foregroundScale} /></label>
              <label class="field"><span>{$_("editor.card_image_foreground_rotation")}</span><input type="number" step="1" bind:value={form.foregroundRotation} /></label>
              <label class="field"><span>{$_("editor.card_image_foreground_width")}</span><input type="number" min="1" step="1" bind:value={form.foregroundWidth} /></label>
              <label class="field"><span>{$_("editor.card_image_foreground_height")}</span><input type="number" min="1" step="1" bind:value={form.foregroundHeight} /></label>
            </div>
          </div>

          <div class="drawer-section foreground-section">
            <div class="effect-block-header">
              <div class="section-title">{$_("editor.card_image_effect_block")}</div>
              <label class="toggle effect-block-toggle"><input type="checkbox" bind:checked={form.effectBlockEnabled} /><span>{$_("editor.card_image_effect_block_enable")}</span></label>
            </div>
            <fieldset class="effect-block-fieldset" disabled={!form.effectBlockEnabled}>
              <div class="field-grid">
                <label class="field"><span>{$_("editor.card_image_effect_block_opacity")}</span><input type="number" min="0" max="1" step="0.05" bind:value={form.effectBlockOpacity} /></label>
                <label class="field">
                  <span>{$_("editor.card_image_effect_block_color")}</span>
                  <div class="color-input-row color-input-row-compact">
                    <input
                      class="color-swatch"
                      type="color"
                      value={form.effectBlockColor || "#f6f2e8"}
                      onchange={(event) => {
                        form = normalizeCardImageFormData({
                          ...form,
                          effectBlockColor: (event.currentTarget as HTMLInputElement).value,
                        });
                      }}
                    />
                    <input type="text" bind:value={form.effectBlockColor} />
                  </div>
                </label>
              </div>
            </fieldset>
            <small class="field-hint">{$_("editor.card_image_effect_block_hint")}</small>
          </div>
        </section>

        <section class="foreground-preview-pane">
          <div class="section-title">{$_("editor.card_image_foreground_preview")}</div>
          <p>{$_("editor.card_image_foreground_preview_hint")}</p>
          <div class="foreground-preview-shell" bind:this={foregroundPreviewShell}>
            <div
              class="foreground-preview-layout"
              style={`width:${FOREGROUND_EDITOR_CARD_WIDTH * getForegroundEditorScale()}px;height:${FOREGROUND_EDITOR_CARD_HEIGHT * getForegroundEditorScale()}px;`}
            >
              <div
                class="foreground-preview-canvas"
                style={`width:${FOREGROUND_EDITOR_CARD_WIDTH}px;height:${FOREGROUND_EDITOR_CARD_HEIGHT}px;transform:scale(${getForegroundEditorScale()});--foreground-handle-scale:${1 / Math.max(getForegroundEditorScale(), 0.01)};`}
              >
                <div class="preview-stage foreground-preview-stage" bind:this={foregroundPreviewHost}></div>
                {#if hasForegroundImage()}
                  <div role="presentation" class="foreground-selection" style={getForegroundSelectionStyle()} onpointerdown={handleForegroundMovePointerDown}>
                    <button
                      class="foreground-handle foreground-handle-rotate"
                      type="button"
                      aria-label={$_("editor.card_image_foreground_rotate_handle")}
                      onpointerdown={handleForegroundRotatePointerDown}
                    ></button>
                    <button
                      class="foreground-handle foreground-handle-scale"
                      type="button"
                      aria-label={$_("editor.card_image_foreground_scale_handle")}
                      onpointerdown={handleForegroundScalePointerDown}
                    ></button>
                  </div>
                {/if}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
{/if}

{#if cropModalOpen}
  <div class="crop-backdrop" role="presentation">
    <div class="crop-dialog" role="dialog" aria-modal="true" aria-label={$_("editor.card_image_crop_title")}>
      <div class="crop-header">
        <div>
          <h4>{$_("editor.card_image_crop_title")}</h4>
          <p>{$_("editor.card_image_crop_hint")}</p>
        </div>
      </div>

      <div class="crop-body">
        {#if sourceImageUrl}
          <div class="crop-canvas">
            <img src={sourceImageUrl} alt="Crop source" class="crop-image" bind:this={cropImageElement} />
            {#if cropBox.size > 0}
              <div
                class="crop-box"
                role="presentation"
                style={`left:${cropBox.x}px;top:${cropBox.y}px;width:${cropBox.size}px;height:${cropBox.size}px;`}
                onpointerdown={handleCropPointerDown}
                onpointermove={handleCropPointerMove}
                onpointerup={handleCropPointerUp}
                onpointercancel={handleCropPointerUp}
                onwheel={handleCropWheel}
              >
                <div class="crop-box-grid"></div>
                <button class="crop-resize-handle" type="button" aria-label={$_("editor.card_image_crop_resize")} onpointerdown={handleCropResizePointerDown}></button>
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <div class="crop-footer">
        <button class="btn-secondary btn-sm" type="button" onclick={cancelCrop}>{$_("editor.card_image_crop_cancel")}</button>
        <button class="btn-primary btn-sm" type="button" onclick={applyCrop}>{$_("editor.card_image_crop_apply")}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .btn-sm { padding: 0.38rem 0.75rem; font-size: 0.84rem; font-weight: 700; border-radius: 8px; border: none; cursor: pointer; transition: all 0.15s; }
  .btn-primary { background: linear-gradient(135deg, #2563eb, #1d4ed8); color: #fff; box-shadow: 0 8px 18px rgba(37, 99, 235, 0.28); }
  .btn-primary:hover { background: linear-gradient(135deg, #3b82f6, #2563eb); }
  .btn-secondary { background: rgba(148, 163, 184, 0.14); color: var(--text-primary); border: 1px solid rgba(148, 163, 184, 0.22); }
  .btn-secondary:hover { background: rgba(148, 163, 184, 0.22); }
  button:disabled { cursor: not-allowed; opacity: 0.6; }
  .drawer-backdrop { position: fixed; inset: 0; z-index: 1200; display: flex; justify-content: flex-end; background: rgba(9, 15, 24, 0.45); backdrop-filter: blur(2px); }
  .drawer-panel { width: min(1320px, 90vw); height: 100vh; background: var(--bg-surface); border-left: 1px solid var(--border-color); box-shadow: -20px 0 40px rgba(0, 0, 0, 0.2); display: flex; flex-direction: column; }
  .drawer-header, .drawer-footer { padding: 14px 18px; border-bottom: 1px solid var(--border-color); display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .drawer-footer { border-bottom: none; border-top: 1px solid var(--border-color); }
  .drawer-header h3, .section-title, .crop-header h4 { font-size: 1rem; font-weight: 700; color: var(--text-primary); }
  .drawer-header p, .preview-header p, .preview-error, .field-hint, .crop-header p { font-size: 0.84rem; color: var(--text-secondary); }
  .close-btn { width: 32px; height: 32px; padding: 0; font-size: 1.4rem; line-height: 1; border-radius: 999px; background: var(--bg-surface-active); color: var(--text-primary); }
  .drawer-body { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(480px, 1.08fr) minmax(460px, 1fr); }
  .form-pane, .preview-pane { min-height: 0; overflow-y: auto; padding: 18px; }
  .preview-pane { border-left: 1px solid var(--border-color); background: radial-gradient(circle at top, rgba(56, 189, 248, 0.08), transparent 30%), var(--bg-base); display: flex; flex-direction: column; gap: 12px; }
  .form-toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 14px; }
  .upload-btn { box-shadow: 0 10px 24px rgba(37, 99, 235, 0.34); padding-inline: 1rem; }
  .field-span-2 { grid-column: span 2; }
  .field-color { grid-column: span 2; }
  .drawer-section { margin-bottom: 18px; padding: 14px; border: 1px solid var(--border-color); border-radius: 10px; background: var(--bg-base); }
  .field-stack { margin-top: 12px; display: flex; flex-direction: column; gap: 12px; }
  .field-grid { margin-top: 12px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 12px; }
  .field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .field span { font-size: 0.82rem; color: var(--text-secondary); font-weight: 600; }
  .field input, .field select, .field textarea { width: 100%; background: var(--bg-surface); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 6px 8px; font-size: 0.9rem; }
  .color-input-row { display: grid; grid-template-columns: 52px minmax(0, 1fr) auto; gap: 8px; align-items: center; }
  .color-input-row-compact { grid-template-columns: 52px minmax(0, 1fr); }
  .color-swatch { min-height: 38px; padding: 4px; cursor: pointer; }
  .subfield-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 12px; margin-top: 6px; }
  .gradient-toggle { margin-top: 6px; align-self: flex-start; }
  .effect-block-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .effect-block-toggle { margin-top: 0; }
  .effect-block-fieldset { margin: 0; padding: 0; border: none; min-width: 0; }
  .effect-block-fieldset:disabled { opacity: 0.58; }
  .field textarea { resize: vertical; min-height: 110px; }
  .toggle-grid { margin-top: 12px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 12px; }
  .toggle { display: flex; align-items: center; gap: 8px; min-width: 0; padding: 8px 10px; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-surface); color: var(--text-primary); font-size: 0.88rem; }
  .toggle input { width: auto; margin: 0; }
  .preview-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
  .preview-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
  .preview-card-shell { position: relative; flex: 1; min-height: clamp(620px, 74vh, 940px); border: 1px solid var(--border-color); border-radius: 12px; background: radial-gradient(circle at top, rgba(56, 189, 248, 0.12), transparent 35%), linear-gradient(180deg, rgba(15, 23, 42, 0.05), rgba(15, 23, 42, 0.02)); overflow: auto; display: flex; align-items: flex-start; justify-content: center; padding: 16px 8px 24px; overscroll-behavior: contain; }
  .preview-stage { display: flex; justify-content: center; align-items: flex-start; min-width: 100%; min-height: 100%; }
  .preview-error { display: flex; align-items: center; justify-content: center; text-align: center; padding: 24px; }
  .preview-error { color: #dc2626; }
  .foreground-backdrop { position: fixed; inset: 0; z-index: 1300; background: rgba(2, 6, 12, 0.62); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; padding: 24px; }
  .foreground-dialog { width: min(1240px, 94vw); max-height: 92vh; background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 18px; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 28px 60px rgba(2, 6, 23, 0.32); }
  .foreground-header { padding: 16px 20px; border-bottom: 1px solid var(--border-color); display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .foreground-header h4 { font-size: 1rem; font-weight: 700; color: var(--text-primary); }
  .foreground-header p, .foreground-preview-pane p { font-size: 0.84rem; color: var(--text-secondary); }
  .foreground-body { min-height: 0; display: grid; grid-template-columns: minmax(320px, 0.8fr) minmax(460px, 1fr); }
  .foreground-form, .foreground-preview-pane { min-height: 0; overflow-y: auto; padding: 18px; }
  .foreground-form { background: linear-gradient(180deg, rgba(15, 23, 42, 0.02), transparent 24%); }
  .foreground-preview-pane { border-left: 1px solid var(--border-color); background: radial-gradient(circle at top, rgba(59, 130, 246, 0.08), transparent 36%), var(--bg-base); display: flex; flex-direction: column; gap: 10px; }
  .foreground-toolbar { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
  .foreground-section { margin-top: 12px; margin-bottom: 0; }
  .foreground-preview-shell { position: relative; flex: 1; min-height: min(72vh, 780px); border: 1px solid var(--border-color); border-radius: 14px; background: linear-gradient(180deg, rgba(15, 23, 42, 0.04), rgba(15, 23, 42, 0.01)); overflow: auto; display: flex; align-items: center; justify-content: center; padding: 18px; }
  .foreground-preview-layout { position: relative; flex: 0 0 auto; }
  .foreground-preview-canvas { position: relative; transform-origin: top left; }
  .foreground-preview-stage { position: absolute; inset: 0; min-width: 0; min-height: 0; display: block; }
  .foreground-selection { position: absolute; border: 3px solid rgba(37, 99, 235, 0.92); border-radius: 16px; background: rgba(37, 99, 235, 0.06); box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.94) inset, 0 14px 30px rgba(37, 99, 235, 0.18); cursor: move; z-index: 4; touch-action: none; }
  .foreground-selection::before { content: ""; position: absolute; inset: 14px; border: 2px dashed rgba(255, 255, 255, 0.84); border-radius: 12px; }
  .foreground-handle { position: absolute; width: 28px; height: 28px; border-radius: 999px; border: 3px solid #eff6ff; background: #2563eb; padding: 0; box-shadow: 0 6px 16px rgba(15, 23, 42, 0.34); transform-origin: center; }
  .foreground-handle-rotate { left: 50%; top: -20px; transform: translate(-50%, -100%) scale(var(--foreground-handle-scale, 1)); cursor: grab; }
  .foreground-handle-scale { right: -16px; bottom: -16px; transform: scale(var(--foreground-handle-scale, 1)); cursor: nwse-resize; }
  .crop-backdrop { position: fixed; inset: 0; z-index: 1200; background: rgba(2, 6, 12, 0.7); display: flex; align-items: center; justify-content: center; padding: 24px; }
  .crop-dialog { width: min(980px, 96vw); max-height: 92vh; background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 16px; overflow: hidden; display: flex; flex-direction: column; }
  .crop-header, .crop-footer { padding: 14px 18px; border-bottom: 1px solid var(--border-color); }
  .crop-footer { border-bottom: none; border-top: 1px solid var(--border-color); display: flex; justify-content: flex-end; gap: 10px; }
  .crop-body { padding: 18px; overflow: auto; }
  .crop-canvas { position: relative; display: inline-block; max-width: 100%; line-height: 0; }
  .crop-image { display: block; max-width: min(86vw, 900px); max-height: min(68vh, 680px); object-fit: contain; user-select: none; }
  .crop-box { position: absolute; border: 2px solid #f8fafc; background: rgba(255, 255, 255, 0.08); box-shadow: 0 0 0 9999px rgba(2, 6, 12, 0.45), 0 0 0 1px rgba(15, 23, 42, 0.7) inset; cursor: move; touch-action: none; }
  .crop-box-grid { position: absolute; inset: 0; background-image: linear-gradient(to right, rgba(255, 255, 255, 0.35) 1px, transparent 1px), linear-gradient(to bottom, rgba(255, 255, 255, 0.35) 1px, transparent 1px); background-size: 33.333% 100%, 100% 33.333%; }
  .crop-resize-handle { position: absolute; right: -8px; bottom: -8px; width: 16px; height: 16px; border-radius: 999px; border: 2px solid #0f172a; background: #f8fafc; cursor: nwse-resize; padding: 0; }
  .sr-only { position: absolute; width: 1px; height: 1px; margin: -1px; border: 0; padding: 0; white-space: nowrap; clip-path: inset(50%); overflow: hidden; }
  @media (max-width: 1280px), (max-height: 820px) {
    .drawer-panel {
      width: min(1240px, 92vw);
      height: 100vh;
    }

    .drawer-body {
      grid-template-columns: minmax(430px, 0.98fr) minmax(400px, 1fr);
    }

    .form-pane,
    .preview-pane {
      padding: 16px;
    }

    .preview-card-shell {
      min-height: clamp(480px, 68vh, 820px);
    }
  }
  @media (max-width: 980px) {
    .drawer-body {
      grid-template-columns: 1fr;
    }

    .preview-pane {
      border-left: none;
      border-top: 1px solid var(--border-color);
    }

    .preview-card-shell {
      min-height: min(72vh, 760px);
    }

    .foreground-body {
      grid-template-columns: 1fr;
    }

    .foreground-preview-pane {
      border-left: none;
      border-top: 1px solid var(--border-color);
    }
  }

  @media (max-width: 720px) {
    .field-grid,
    .toggle-grid {
      grid-template-columns: 1fr;
    }

    .field-span-2 {
      grid-column: span 1;
    }

    .field-color {
      grid-column: span 1;
    }

    .color-input-row {
      grid-template-columns: 52px minmax(0, 1fr);
    }

    .subfield-grid {
      grid-template-columns: 1fr;
    }

    .foreground-dialog {
      width: 100vw;
      max-height: 100vh;
      height: 100vh;
      border-radius: 0;
    }

    .foreground-backdrop {
      padding: 0;
    }
  }
</style>
