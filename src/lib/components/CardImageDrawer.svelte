<script lang="ts">
  import { tick } from "svelte";
  import { _ } from "svelte-i18n";
  import { isTauri } from "@tauri-apps/api/core";
  import { ask, message, save } from "@tauri-apps/plugin-dialog";
  import { exists, writeFile } from "@tauri-apps/plugin-fs";
  import { dirname, join, resolveResource } from "@tauri-apps/api/path";
  import type { CardDataEntry } from "$lib/types";
  import { HAS_AI_FEATURE } from "$lib/config/build";
  import { showToast } from "$lib/stores/toast.svelte";
  import { hasConfiguredSecretKey, loadAppSettings } from "$lib/stores/appSettings.svelte";
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
    leafer?: { destroy?: () => void; export: (type: string, options?: Record<string, unknown>) => Promise<unknown> };
    setData?: (data: CardImageFormData) => void;
  };

  type CropBox = { x: number; y: number; size: number };
  type DragMode = "move" | "resize" | null;
  type LabelOption = { value: string; label?: string; labelKey?: string };

  const CARD_WIDTH = 1488;
  const CARD_HEIGHT = 2079;
  const CROPPED_IMAGE_SIZE = 1024;
  const MIN_CROP_SIZE = 80;
  const MIN_EXPORT_SCALE_PERCENT = 10;
  const MAX_EXPORT_SCALE_PERCENT = 100;
  const DEFAULT_EXPORT_SCALE_PERCENT = 43;

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

  let yugiohCardConstructorPromise: Promise<YugiohCardConstructor> | null = null;
  let resourcePathPromise: Promise<string> | null = null;
  let previewResizeObserver: ResizeObserver | null = null;

  async function getResourcePath() {
    if (!isTauri()) {
      return `${window.location.origin}/resources/yugioh-card`;
    }

    if (!resourcePathPromise) {
      resourcePathPromise = resolveResource("resources/yugioh-card")
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
    exportScalePercent = DEFAULT_EXPORT_SCALE_PERCENT;
    revokeSourceImageUrl();
  }

  function openFilePicker() {
    fileInput?.click();
  }

  function getOptionLabel(option: LabelOption) {
    if (option.labelKey) return $_(option.labelKey);
    return option.label ?? option.value;
  }

  async function ensureAiReady() {
    if (!HAS_AI_FEATURE) {
      return false;
    }

    await loadAppSettings();
    if (hasConfiguredSecretKey()) {
      return true;
    }

    await message($_("editor.ai_requires_secret_key"), {
      title: $_("editor.ai_requires_secret_key_title"),
      kind: "warning",
    });
    return false;
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

  function getPreviewScale() {
    const availableWidth = Math.max(previewWidth - 40, 320);
    const availableHeight = Math.max(previewHeight - 40, 420);
    return Math.max(Math.min(availableWidth / CARD_WIDTH, availableHeight / CARD_HEIGHT) * 1.32, 0.1);
  }

  function buildPreviewData(): CardImageFormData {
    return normalizeCardImageFormData({
      ...form,
      image: croppedImageDataUrl,
      scale: Math.max(getPreviewScale(), 0.1),
    });
  }

  function buildJpgData(): CardImageFormData {
    return normalizeCardImageFormData({
      ...form,
      image: croppedImageDataUrl,
      scale: exportScalePercent / 100,
    });
  }

  function buildPngData(): CardImageFormData {
    return normalizeCardImageFormData({
      ...form,
      image: croppedImageDataUrl,
      scale: 1,
    });
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
    void croppedImageDataUrl;
    void previewWidth;
    void previewHeight;
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
      exportCard = new YugiohCard({
        view: host,
        data,
        resourcePath: await getResourcePath(),
      });

      await tick();
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

  async function refreshPreview() {
    if (!open || !previewHost || !previewFontsReady) return;

    try {
      errorMessage = "";
      const cardInstance = await ensurePreviewCard();
      cardInstance?.setData?.(buildPreviewData());
    } catch (error) {
      console.error("Failed to refresh card image preview", error);
      errorMessage = $_("editor.card_image_generate_failed");
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

  async function handleDownload() {
    isDownloading = true;

    try {
      const pngBlob = await renderCardBlob(buildPngData(), "png");

      const targetPath = await save({
        defaultPath: `${form.password || card.code || "card"}.png`,
        filters: [{ name: "PNG", extensions: ["png"] }],
      });
      if (!targetPath) return;

      const bytes = await blobToUint8Array(pngBlob);
      await writeFile(targetPath, bytes);
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
      const picsDir = await join(await dirname(cdbPath), "pics");
      const picPath = await join(picsDir, `${card.code}.jpg`);

      let shouldOverwrite = true;
      if (await exists(picPath)) {
        shouldOverwrite = await ask($_("editor.card_image_save_jpg_overwrite_confirm", {
          values: { code: String(card.code) },
        }), {
          title: $_("editor.card_image_save_jpg_overwrite_title"),
          kind: "warning",
        });
      }

      if (!shouldOverwrite) return;

      const jpgBlob = await renderCardBlob(buildJpgData(), "jpg", 0.92);
      const bytes = await blobToUint8Array(jpgBlob);
      await writeFile(picPath, bytes);
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
      resetImageState();
      return;
    }

    if (hydrationKey !== lastHydrationKey) {
      lastHydrationKey = hydrationKey;
      form = createCardImageFormData(card);
      lastFormLanguage = form.language;
      resetImageState();
      destroyPreview();
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
    if (!open) return;

    trackPreviewDependencies();

    clearTimeout(previewTimer ?? undefined);
    previewTimer = setTimeout(() => {
      void refreshPreview();
    }, 40);

    return () => {
      clearTimeout(previewTimer ?? undefined);
      previewTimer = null;
    };
  });

  $effect(() => {
    return () => {
      clearTimeout(previewTimer ?? undefined);
      clearTimeout(previewWarmupTimer ?? undefined);
      destroyPreview();
      previewResizeObserver?.disconnect();
      revokeSourceImageUrl();
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
            <button class="btn-primary btn-sm upload-btn" type="button" onclick={openFilePicker}>
              {croppedImageDataUrl ? $_("editor.card_image_recrop") : $_("editor.card_image_upload")}
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

          <div class="preview-card-shell" bind:this={previewShell}>
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
  .drawer-section { margin-bottom: 18px; padding: 14px; border: 1px solid var(--border-color); border-radius: 10px; background: var(--bg-base); }
  .field-stack { margin-top: 12px; display: flex; flex-direction: column; gap: 12px; }
  .field-grid { margin-top: 12px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 12px; }
  .field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .field span { font-size: 0.82rem; color: var(--text-secondary); font-weight: 600; }
  .field input, .field select, .field textarea { width: 100%; background: var(--bg-surface); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 6px 8px; font-size: 0.9rem; }
  .field textarea { resize: vertical; min-height: 110px; }
  .toggle-grid { margin-top: 12px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 12px; }
  .toggle { display: flex; align-items: center; gap: 8px; min-width: 0; padding: 8px 10px; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-surface); color: var(--text-primary); font-size: 0.88rem; }
  .toggle input { width: auto; margin: 0; }
  .preview-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
  .preview-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
  .preview-card-shell { position: relative; flex: 1; min-height: clamp(620px, 74vh, 940px); border: 1px solid var(--border-color); border-radius: 12px; background: radial-gradient(circle at top, rgba(56, 189, 248, 0.12), transparent 35%), linear-gradient(180deg, rgba(15, 23, 42, 0.05), rgba(15, 23, 42, 0.02)); overflow: auto; display: flex; align-items: center; justify-content: center; padding: 8px; }
  .preview-stage { display: flex; justify-content: center; align-items: center; min-width: 100%; min-height: 100%; }
  .preview-error { display: flex; align-items: center; justify-content: center; text-align: center; padding: 24px; }
  .preview-error { color: #dc2626; }
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
  }

  @media (max-width: 720px) { .field-grid, .toggle-grid { grid-template-columns: 1fr; } .field-span-2 { grid-column: span 1; } }
</style>
