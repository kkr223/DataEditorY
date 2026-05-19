import { normalizeCardImageFormData, type CardImageLanguage } from './layout';
import type { CropBox } from './crop/geometry';
import {
  FOREGROUND_EDITOR_CARD_HEIGHT,
  FOREGROUND_EDITOR_CARD_WIDTH,
  type ForegroundEditorMode,
  type ForegroundInitialState,
} from './foreground/geometry';

type DragMode = 'move' | 'resize' | null;

export type CardImageInitialStateOptions = {
  maxCropPreviewWidth: number;
  maxCropPreviewHeight: number;
  defaultPreviewZoomPercent: number;
  defaultExportScalePercent: number;
};

export const createCardImageInitialState = ({
  maxCropPreviewWidth,
  maxCropPreviewHeight,
  defaultPreviewZoomPercent,
  defaultExportScalePercent,
}: CardImageInitialStateOptions) => ({
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
  cropViewportWidth: typeof window === 'undefined' ? maxCropPreviewWidth : window.innerWidth,
  cropViewportHeight: typeof window === 'undefined' ? maxCropPreviewHeight : window.innerHeight,
  previewWidth: 360,
  previewHeight: 640,
  foregroundPreviewWidth: 420,
  foregroundPreviewHeight: 680,
  foregroundRenderWidth: FOREGROUND_EDITOR_CARD_WIDTH,
  foregroundRenderHeight: FOREGROUND_EDITOR_CARD_HEIGHT,
  foregroundRenderOffsetX: 0,
  foregroundRenderOffsetY: 0,
  previewZoomPercent: defaultPreviewZoomPercent,
  hasManualPreviewZoom: false,
  exportScalePercent: defaultExportScalePercent,
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
