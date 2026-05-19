import { tick } from 'svelte';
import {
  calculateCropStageMetrics,
  createCenteredCropBox,
  moveCropBox,
  normalizeCropRotation,
  radiansFromDegrees,
  recenterCropBox,
  resizeCropBox,
  resizeCropBoxAroundCenter,
  type CropBox,
} from './geometry';

type DragMode = 'move' | 'resize' | null;

export type CardImageCropState = {
  croppedImageDataUrl: string;
  sourceImageUrl: string;
  sourceImageWidth: number;
  sourceImageHeight: number;
  cropBodyElement: HTMLDivElement | null;
  cropSidebarElement: HTMLElement | null;
  cropModalOpen: boolean;
  cropRotation: number;
  cropBox: CropBox;
  dragMode: DragMode;
  dragPointerId: number | null;
  dragStartX: number;
  dragStartY: number;
  dragStartBox: CropBox;
  cropViewportWidth: number;
  cropViewportHeight: number;
};

export type CardImageCropControllerOptions = {
  state: CardImageCropState;
  setCroppedImageDataUrl: (dataUrl: string) => void;
  revokeSourceImageUrl: () => void;
  croppedImageSize: number;
  minCropSize: number;
  layoutBreakpoint: number;
  layoutGap: number;
  sidebarFallbackWidth: number;
  maxPreviewWidth: number;
  maxPreviewHeight: number;
};

export const createCardImageCropController = ({
  state,
  setCroppedImageDataUrl,
  revokeSourceImageUrl,
  croppedImageSize,
  minCropSize,
  layoutBreakpoint,
  layoutGap,
  sidebarFallbackWidth,
  maxPreviewWidth,
  maxPreviewHeight,
}: CardImageCropControllerOptions) => {
  const getCropRotationRadians = () => radiansFromDegrees(state.cropRotation);

  const getCropStageMetrics = () => calculateCropStageMetrics({
    sourceImageWidth: state.sourceImageWidth,
    sourceImageHeight: state.sourceImageHeight,
    rotation: state.cropRotation,
    viewportWidth: state.cropViewportWidth,
    viewportHeight: state.cropViewportHeight,
    bodyWidth: state.cropBodyElement?.clientWidth ?? 0,
    sidebarWidth: state.cropSidebarElement?.clientWidth ?? sidebarFallbackWidth,
    minCropSize,
    layoutBreakpoint,
    layoutGap,
    maxPreviewWidth,
    maxPreviewHeight,
  });

  const initializeCropBox = () => {
    const nextBox = createCenteredCropBox(getCropStageMetrics(), minCropSize);
    if (!nextBox) return;
    state.cropBox = nextBox;
  };

  const setCropRotation = (nextRotation: number) => {
    const next = normalizeCropRotation(nextRotation);
    if (next === state.cropRotation) return;

    const size = state.cropBox.size;
    state.cropRotation = next;
    state.cropBox = size
      ? recenterCropBox(state.cropBox, getCropStageMetrics(), minCropSize)
      : state.cropBox;
  };

  const rotateCropPreview = (delta: number) => {
    setCropRotation(state.cropRotation + delta);
  };

  const resetCropRotation = () => {
    setCropRotation(0);
  };

  const handleCropRotationInput = (event: Event) => {
    setCropRotation(Number((event.currentTarget as HTMLInputElement).value));
  };

  const handleCropRotationNumberInput = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || trimmed === '-' || trimmed === '.' || trimmed === '-.') {
      return;
    }

    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      return;
    }

    setCropRotation(parsed);
  };

  const handleCropRotationNumberBlur = () => {
    setCropRotation(state.cropRotation);
  };

  const handleCropViewportResize = () => {
    if (typeof window === 'undefined') return;
    state.cropViewportWidth = window.innerWidth;
    state.cropViewportHeight = window.innerHeight;
    if (!state.cropModalOpen) return;
    if (!state.cropBox.size) {
      initializeCropBox();
      return;
    }

    state.cropBox = recenterCropBox(state.cropBox, getCropStageMetrics(), minCropSize);
  };

  const handleImageUpload = async (event: Event) => {
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
  };

  const applyCrop = async () => {
    if (!state.sourceImageUrl || !state.sourceImageWidth || !state.sourceImageHeight) return;

    const metrics = getCropStageMetrics();
    if (!metrics.stageWidth || !metrics.stageHeight) return;

    const canvas = document.createElement('canvas');
    canvas.width = croppedImageSize;
    canvas.height = croppedImageSize;
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
    stageContext.drawImage(
      image,
      -state.sourceImageWidth / 2,
      -state.sourceImageHeight / 2,
      state.sourceImageWidth,
      state.sourceImageHeight,
    );
    stageContext.restore();

    const scaleX = stageCanvas.width / metrics.stageWidth;
    const scaleY = stageCanvas.height / metrics.stageHeight;
    context.clearRect(0, 0, croppedImageSize, croppedImageSize);
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
      croppedImageSize,
      croppedImageSize,
    );

    const dataUrl = canvas.toDataURL('image/png');
    state.croppedImageDataUrl = dataUrl;
    setCroppedImageDataUrl(dataUrl);
    state.cropModalOpen = false;
  };

  const cancelCrop = () => {
    if (!state.croppedImageDataUrl) {
      revokeSourceImageUrl();
      state.sourceImageWidth = 0;
      state.sourceImageHeight = 0;
    }
    state.cropModalOpen = false;
    state.cropRotation = 0;
    state.dragMode = null;
    state.dragPointerId = null;
  };

  const handleCropPointerDown = (event: PointerEvent) => {
    state.dragMode = 'move';
    state.dragPointerId = event.pointerId;
    state.dragStartX = event.clientX;
    state.dragStartY = event.clientY;
    state.dragStartBox = { ...state.cropBox };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const handleCropResizePointerDown = (event: PointerEvent) => {
    event.stopPropagation();
    state.dragMode = 'resize';
    state.dragPointerId = event.pointerId;
    state.dragStartX = event.clientX;
    state.dragStartY = event.clientY;
    state.dragStartBox = { ...state.cropBox };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const handleCropPointerMove = (event: PointerEvent) => {
    if (!state.dragMode || state.dragPointerId !== event.pointerId) return;

    const dx = event.clientX - state.dragStartX;
    const dy = event.clientY - state.dragStartY;

    if (state.dragMode === 'move') {
      state.cropBox = moveCropBox(state.dragStartBox, dx, dy, getCropStageMetrics(), minCropSize);
      return;
    }

    state.cropBox = resizeCropBox(state.dragStartBox, Math.max(dx, dy), getCropStageMetrics(), minCropSize);
  };

  const handleCropPointerUp = (event: PointerEvent) => {
    if (state.dragPointerId !== event.pointerId) return;
    state.dragMode = null;
    state.dragPointerId = null;
  };

  const handleCropWheel = (event: WheelEvent) => {
    event.preventDefault();
    const delta = Math.sign(event.deltaY) * 20;
    state.cropBox = resizeCropBoxAroundCenter(state.cropBox, delta, getCropStageMetrics(), minCropSize);
  };

  return {
    applyCrop,
    cancelCrop,
    getCropStageMetrics,
    handleCropPointerDown,
    handleCropPointerMove,
    handleCropPointerUp,
    handleCropResizePointerDown,
    handleCropRotationInput,
    handleCropRotationNumberBlur,
    handleCropRotationNumberInput,
    handleCropViewportResize,
    handleCropWheel,
    handleImageUpload,
    resetCropRotation,
    rotateCropPreview,
  };
};
