import type { CardImageFormData } from '../layout';
import {
  calculateForegroundEditorScale,
  calculateForegroundRenderBounds,
  calculatePointerAngle,
  calculatePointerDistance,
  createEmptyForegroundState,
  createForegroundInitialStateFromForm,
  createForegroundSelectionStyle,
  createForegroundUploadInitialState,
  hasForegroundImage as hasForegroundImageData,
  moveForegroundFromDrag,
  rotateForegroundFromDrag,
  scaleForegroundFromDrag,
  type ForegroundEditorMode,
  type ForegroundInitialState,
} from './geometry';
import { readForegroundFileAsDataUrl, trimTransparentForegroundImage } from './image';

export type CardImageForegroundState = {
  form: CardImageFormData;
  foregroundFileInput: HTMLInputElement | null;
  foregroundEditorOpen: boolean;
  foregroundPreviewHost: HTMLDivElement | null;
  foregroundPreviewShell: HTMLDivElement | null;
  foregroundPreviewImageUrl: string;
  foregroundRenderableUrl: string;
  foregroundPreviewWidth: number;
  foregroundPreviewHeight: number;
  foregroundRenderWidth: number;
  foregroundRenderHeight: number;
  foregroundRenderOffsetX: number;
  foregroundRenderOffsetY: number;
  foregroundDragMode: ForegroundEditorMode;
  foregroundDragPointerId: number | null;
  foregroundDragStartX: number;
  foregroundDragStartY: number;
  foregroundDragStartForegroundX: number;
  foregroundDragStartForegroundY: number;
  foregroundDragStartForegroundScale: number;
  foregroundDragStartForegroundRotation: number;
  foregroundDragStartAngle: number;
  foregroundDragStartDistance: number;
  foregroundDragCenterClientX: number;
  foregroundDragCenterClientY: number;
  initialForegroundState: ForegroundInitialState | null;
};

export type CardImageForegroundControllerOptions = {
  state: CardImageForegroundState;
  hasExtraBuild: boolean;
  updateForm: (patch: Partial<CardImageFormData>) => void;
  syncForegroundRenderableUrl: (url: string) => Promise<void>;
  revokeForegroundRenderableUrl: () => void;
  destroyForegroundPreview: () => void;
  showUploadFailed: () => void;
};

export const createCardImageForegroundController = ({
  state,
  hasExtraBuild,
  updateForm,
  syncForegroundRenderableUrl,
  revokeForegroundRenderableUrl,
  destroyForegroundPreview,
  showUploadFailed,
}: CardImageForegroundControllerOptions) => {
  const resetForegroundState = () => {
    state.foregroundEditorOpen = false;
    state.foregroundDragMode = null;
    state.foregroundDragPointerId = null;
  };

  const clearForegroundInitialState = () => {
    state.initialForegroundState = null;
  };

  const setInitialForegroundStateFromForm = (data: CardImageFormData) => {
    state.initialForegroundState = createForegroundInitialStateFromForm(data);
  };

  const openForegroundFilePicker = () => {
    if (!hasExtraBuild) return;
    state.foregroundFileInput?.click();
  };

  const openForegroundEditor = () => {
    if (!hasExtraBuild) return;
    state.foregroundEditorOpen = true;
  };

  const getForegroundEditorScale = () => calculateForegroundEditorScale({
    previewWidth: state.foregroundPreviewWidth,
    previewHeight: state.foregroundPreviewHeight,
  });

  const hasForegroundImage = () => hasForegroundImageData(state.form);

  const getForegroundSelectionStyle = () => createForegroundSelectionStyle({
    data: state.form,
    bounds: {
      width: state.foregroundRenderWidth,
      height: state.foregroundRenderHeight,
      offsetX: state.foregroundRenderOffsetX,
      offsetY: state.foregroundRenderOffsetY,
    },
  });

  const resetForegroundTransform = () => {
    if (!hasForegroundImage() || !state.initialForegroundState) return;

    updateForm({
      foregroundWidth: state.initialForegroundState.foregroundWidth,
      foregroundHeight: state.initialForegroundState.foregroundHeight,
      foregroundX: state.initialForegroundState.foregroundX,
      foregroundY: state.initialForegroundState.foregroundY,
      foregroundScale: state.initialForegroundState.foregroundScale,
      foregroundRotation: state.initialForegroundState.foregroundRotation,
    });
  };

  const clearForegroundImage = () => {
    clearForegroundInitialState();
    revokeForegroundRenderableUrl();
    updateForm({
      foregroundImage: '',
      ...createEmptyForegroundState(),
    });
  };

  const handleForegroundImageUpload = async (event: Event) => {
    if (!hasExtraBuild) return;
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const uploaded = await trimTransparentForegroundImage((await readForegroundFileAsDataUrl(file)).dataUrl);
      const nextInitialState = createForegroundUploadInitialState({
        width: uploaded.width,
        height: uploaded.height,
        isReplacing: hasForegroundImage(),
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
      showUploadFailed();
    } finally {
      input.value = '';
    }
  };

  const measureForegroundRenderBounds = () => {
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
  };

  const stopForegroundInteraction = () => {
    state.foregroundDragMode = null;
    state.foregroundDragPointerId = null;
    window.removeEventListener('pointermove', handleForegroundPointerMove);
    window.removeEventListener('pointerup', handleForegroundPointerUp);
    window.removeEventListener('pointercancel', handleForegroundPointerUp);
  };

  const beginForegroundInteraction = (event: PointerEvent, mode: ForegroundEditorMode) => {
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
  };

  const handleForegroundMovePointerDown = (event: PointerEvent) => {
    beginForegroundInteraction(event, 'move');
  };

  const handleForegroundScalePointerDown = (event: PointerEvent) => {
    beginForegroundInteraction(event, 'scale');
  };

  const handleForegroundRotatePointerDown = (event: PointerEvent) => {
    beginForegroundInteraction(event, 'rotate');
  };

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

  const closeForegroundEditor = () => {
    resetForegroundState();
    destroyForegroundPreview();
  };

  const handleForegroundBackdropClick = (event: MouseEvent) => {
    if (event.currentTarget === event.target) {
      closeForegroundEditor();
    }
  };

  return {
    clearForegroundImage,
    clearForegroundInitialState,
    closeForegroundEditor,
    getForegroundEditorScale,
    getForegroundSelectionStyle,
    handleForegroundBackdropClick,
    handleForegroundImageUpload,
    handleForegroundMovePointerDown,
    handleForegroundRotatePointerDown,
    handleForegroundScalePointerDown,
    hasForegroundImage,
    measureForegroundRenderBounds,
    openForegroundEditor,
    openForegroundFilePicker,
    resetForegroundState,
    resetForegroundTransform,
    setInitialForegroundStateFromForm,
    stopForegroundInteraction,
  };
};
