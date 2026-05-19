import type { CardImageFormData } from '../layout';

export const FOREGROUND_EDITOR_CARD_WIDTH = 1394;
export const FOREGROUND_EDITOR_CARD_HEIGHT = 2031;
export const FOREGROUND_EDITOR_PADDING = 32;
export const MIN_FOREGROUND_SCALE = 0.05;
export const MAX_FOREGROUND_SCALE = 12;

const DEFAULT_EDITOR_SCALE = 0.32;
const DEFAULT_FOREGROUND_FIT_RATIO = 0.92;
const MIN_POINTER_DISTANCE = 1;

export type ForegroundEditorMode = 'move' | 'scale' | 'rotate' | null;
export type ForegroundPoint = { x: number; y: number };
export type ForegroundInitialState = Pick<
  CardImageFormData,
  'foregroundWidth' | 'foregroundHeight' | 'foregroundX' | 'foregroundY' | 'foregroundScale' | 'foregroundRotation'
>;

export type ForegroundImageState = Pick<
  CardImageFormData,
  | 'foregroundImage'
  | 'foregroundWidth'
  | 'foregroundHeight'
  | 'foregroundX'
  | 'foregroundY'
  | 'foregroundScale'
  | 'foregroundRotation'
>;

export type ForegroundRenderBounds = {
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
};

export type ForegroundSelectionSize = {
  width: number;
  height: number;
};

export type ForegroundEditorScaleInput = {
  previewWidth: number;
  previewHeight: number;
  cardWidth?: number;
  cardHeight?: number;
  padding?: number;
  fallbackScale?: number;
};

export type ForegroundRenderBoundsInput = {
  contentWidth?: number;
  contentHeight?: number;
  contentOffsetX?: number;
  contentOffsetY?: number;
  hostWidth?: number;
  hostHeight?: number;
  cardWidth?: number;
  cardHeight?: number;
};

export type ForegroundUploadInitialStateInput = {
  width: number;
  height: number;
  isReplacing: boolean;
  currentState: ForegroundInitialState;
};

export const calculateForegroundEditorScale = ({
  previewWidth,
  previewHeight,
  cardWidth = FOREGROUND_EDITOR_CARD_WIDTH,
  cardHeight = FOREGROUND_EDITOR_CARD_HEIGHT,
  padding = FOREGROUND_EDITOR_PADDING,
  fallbackScale = DEFAULT_EDITOR_SCALE,
}: ForegroundEditorScaleInput) => {
  if (!previewWidth || !previewHeight) {
    return fallbackScale;
  }

  const availableWidth = Math.max(previewWidth - padding * 2, 1);
  const availableHeight = Math.max(previewHeight - padding * 2, 1);
  return Math.min(availableWidth / cardWidth, availableHeight / cardHeight);
};

export const clampForegroundScale = (
  scale: number,
  minScale = MIN_FOREGROUND_SCALE,
  maxScale = MAX_FOREGROUND_SCALE,
) => Math.max(minScale, Math.min(maxScale, scale));

export const calculateForegroundSelectionSize = (
  data: Pick<CardImageFormData, 'foregroundWidth' | 'foregroundHeight' | 'foregroundScale'>,
): ForegroundSelectionSize => ({
  width: Math.max(0, data.foregroundWidth * data.foregroundScale),
  height: Math.max(0, data.foregroundHeight * data.foregroundScale),
});

export const hasForegroundImage = (
  data: Pick<CardImageFormData, 'foregroundImage' | 'foregroundWidth' | 'foregroundHeight'>,
) => Boolean(data.foregroundImage && data.foregroundWidth > 0 && data.foregroundHeight > 0);

export const createForegroundSelectionStyle = ({
  data,
  bounds,
  cardWidth = FOREGROUND_EDITOR_CARD_WIDTH,
  cardHeight = FOREGROUND_EDITOR_CARD_HEIGHT,
}: {
  data: Pick<
    CardImageFormData,
    'foregroundWidth' | 'foregroundHeight' | 'foregroundX' | 'foregroundY' | 'foregroundScale' | 'foregroundRotation'
  >;
  bounds: ForegroundRenderBounds;
  cardWidth?: number;
  cardHeight?: number;
}) => {
  const renderScaleX = bounds.width > 0 ? bounds.width / cardWidth : 1;
  const renderScaleY = bounds.height > 0 ? bounds.height / cardHeight : 1;
  const { width, height } = calculateForegroundSelectionSize(data);

  return [
    `left:${bounds.offsetX + (data.foregroundX - width / 2) * renderScaleX}px`,
    `top:${bounds.offsetY + (data.foregroundY - height / 2) * renderScaleY}px`,
    `width:${width * renderScaleX}px`,
    `height:${height * renderScaleY}px`,
    `transform:rotate(${data.foregroundRotation}deg)`,
  ].join(';');
};

export const calculateDefaultForegroundScale = (
  width: number,
  height: number,
  {
    cardWidth = FOREGROUND_EDITOR_CARD_WIDTH,
    cardHeight = FOREGROUND_EDITOR_CARD_HEIGHT,
    fitRatio = DEFAULT_FOREGROUND_FIT_RATIO,
  }: {
    cardWidth?: number;
    cardHeight?: number;
    fitRatio?: number;
  } = {},
) => {
  if (!width || !height) {
    return 1;
  }

  return clampForegroundScale(Math.min(
    1,
    (cardWidth * fitRatio) / width,
    (cardHeight * fitRatio) / height,
  ));
};

export const createForegroundInitialStateFromForm = (
  data: ForegroundImageState,
): ForegroundInitialState | null => {
  if (!hasForegroundImage(data)) {
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
};

export const createEmptyForegroundState = (): ForegroundInitialState => ({
  foregroundWidth: 0,
  foregroundHeight: 0,
  foregroundX: FOREGROUND_EDITOR_CARD_WIDTH / 2,
  foregroundY: FOREGROUND_EDITOR_CARD_HEIGHT / 2,
  foregroundScale: 1,
  foregroundRotation: 0,
});

export const createForegroundUploadInitialState = ({
  width,
  height,
  isReplacing,
  currentState,
}: ForegroundUploadInitialStateInput): ForegroundInitialState => ({
  foregroundWidth: width,
  foregroundHeight: height,
  foregroundX: isReplacing ? currentState.foregroundX : FOREGROUND_EDITOR_CARD_WIDTH / 2,
  foregroundY: isReplacing ? currentState.foregroundY : FOREGROUND_EDITOR_CARD_HEIGHT / 2,
  foregroundScale: isReplacing ? currentState.foregroundScale : calculateDefaultForegroundScale(width, height),
  foregroundRotation: isReplacing ? currentState.foregroundRotation : 0,
});

export const calculateForegroundRenderBounds = ({
  contentWidth,
  contentHeight,
  contentOffsetX,
  contentOffsetY,
  hostWidth,
  hostHeight,
  cardWidth = FOREGROUND_EDITOR_CARD_WIDTH,
  cardHeight = FOREGROUND_EDITOR_CARD_HEIGHT,
}: ForegroundRenderBoundsInput): ForegroundRenderBounds => ({
  width: contentWidth || hostWidth || cardWidth,
  height: contentHeight || hostHeight || cardHeight,
  offsetX: contentOffsetX ?? 0,
  offsetY: contentOffsetY ?? 0,
});

export const calculatePointerAngle = (
  pointer: ForegroundPoint,
  center: ForegroundPoint,
) => Math.atan2(pointer.y - center.y, pointer.x - center.x) * 180 / Math.PI;

export const calculatePointerDistance = (
  pointer: ForegroundPoint,
  center: ForegroundPoint,
) => Math.max(Math.hypot(pointer.x - center.x, pointer.y - center.y), MIN_POINTER_DISTANCE);

export const moveForegroundFromDrag = ({
  pointer,
  startPointer,
  startPosition,
  editorScale,
}: {
  pointer: ForegroundPoint;
  startPointer: ForegroundPoint;
  startPosition: ForegroundPoint;
  editorScale: number;
}) => {
  const safeScale = Math.max(editorScale, 0.01);
  return {
    foregroundX: startPosition.x + (pointer.x - startPointer.x) / safeScale,
    foregroundY: startPosition.y + (pointer.y - startPointer.y) / safeScale,
  };
};

export const scaleForegroundFromDrag = ({
  pointer,
  center,
  startScale,
  startDistance,
}: {
  pointer: ForegroundPoint;
  center: ForegroundPoint;
  startScale: number;
  startDistance: number;
}) => ({
  foregroundScale: clampForegroundScale(
    startScale * (calculatePointerDistance(pointer, center) / Math.max(startDistance, MIN_POINTER_DISTANCE)),
  ),
});

export const rotateForegroundFromDrag = ({
  pointer,
  center,
  startRotation,
  startAngle,
}: {
  pointer: ForegroundPoint;
  center: ForegroundPoint;
  startRotation: number;
  startAngle: number;
}) => ({
  foregroundRotation: startRotation + (calculatePointerAngle(pointer, center) - startAngle),
});
