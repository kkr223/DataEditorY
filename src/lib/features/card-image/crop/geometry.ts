export type CropBox = { x: number; y: number; size: number };

export type CropStageMetrics = {
  stageWidth: number;
  stageHeight: number;
  imageWidth: number;
  imageHeight: number;
  imageOffsetX: number;
  imageOffsetY: number;
  renderWidth: number;
  renderHeight: number;
};

export type CropStageInput = {
  sourceImageWidth: number;
  sourceImageHeight: number;
  rotation: number;
  viewportWidth: number;
  viewportHeight: number;
  bodyWidth: number;
  sidebarWidth: number;
  minCropSize: number;
  layoutBreakpoint: number;
  layoutGap: number;
  maxPreviewWidth: number;
  maxPreviewHeight: number;
};

export const emptyCropStageMetrics = (): CropStageMetrics => ({
  stageWidth: 0,
  stageHeight: 0,
  imageWidth: 0,
  imageHeight: 0,
  imageOffsetX: 0,
  imageOffsetY: 0,
  renderWidth: 0,
  renderHeight: 0,
});

export const radiansFromDegrees = (degrees: number) => (degrees * Math.PI) / 180;

export const normalizeCropRotation = (nextRotation: number) => {
  const rounded = Math.round(nextRotation * 10) / 10;
  const normalized = (((rounded + 180) % 360) + 360) % 360 - 180;
  const fixed = Number(normalized.toFixed(1));
  return fixed === -180 ? 180 : fixed;
};

export const calculateCropStageMetrics = (input: CropStageInput): CropStageMetrics => {
  if (!input.sourceImageWidth || !input.sourceImageHeight) {
    return emptyCropStageMetrics();
  }

  const angle = radiansFromDegrees(input.rotation);
  const cos = Math.abs(Math.cos(angle));
  const sin = Math.abs(Math.sin(angle));
  const rotatedWidth = input.sourceImageWidth * cos + input.sourceImageHeight * sin;
  const rotatedHeight = input.sourceImageWidth * sin + input.sourceImageHeight * cos;
  const isStackedLayout = input.viewportWidth <= input.layoutBreakpoint;
  const sidebarWidth = isStackedLayout ? 0 : input.sidebarWidth;
  const maxWidth = Math.min(
    input.bodyWidth > 0
      ? Math.max(input.bodyWidth - sidebarWidth - (isStackedLayout ? 0 : input.layoutGap), input.minCropSize)
      : input.viewportWidth * 0.86,
    input.maxPreviewWidth,
  );
  const maxHeight = Math.min(input.viewportHeight * 0.68, input.maxPreviewHeight);
  const scale = Math.min(maxWidth / rotatedWidth, maxHeight / rotatedHeight, 1);
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const stageWidth = rotatedWidth * safeScale;
  const stageHeight = rotatedHeight * safeScale;
  const imageWidth = input.sourceImageWidth * safeScale;
  const imageHeight = input.sourceImageHeight * safeScale;

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
};

export const clampCropBoxToStage = (
  nextBox: CropBox,
  metrics: Pick<CropStageMetrics, 'stageWidth' | 'stageHeight'>,
  minCropSize: number,
): CropBox => {
  if (!metrics.stageWidth || !metrics.stageHeight) return nextBox;

  const maxSize = Math.min(metrics.stageWidth, metrics.stageHeight);
  const size = Math.min(Math.max(nextBox.size, minCropSize), maxSize);
  const x = Math.min(Math.max(nextBox.x, 0), Math.max(metrics.stageWidth - size, 0));
  const y = Math.min(Math.max(nextBox.y, 0), Math.max(metrics.stageHeight - size, 0));

  return { x, y, size };
};

export const createCenteredCropBox = (
  metrics: Pick<CropStageMetrics, 'stageWidth' | 'stageHeight'>,
  minCropSize: number,
): CropBox | null => {
  if (!metrics.stageWidth || !metrics.stageHeight) return null;

  const size = Math.max(minCropSize, Math.min(metrics.stageWidth, metrics.stageHeight) * 0.72);
  return {
    x: (metrics.stageWidth - size) / 2,
    y: (metrics.stageHeight - size) / 2,
    size,
  };
};

export const recenterCropBox = (
  box: CropBox,
  metrics: Pick<CropStageMetrics, 'stageWidth' | 'stageHeight'>,
  minCropSize: number,
) => {
  const centerX = box.x + box.size / 2;
  const centerY = box.y + box.size / 2;
  return clampCropBoxToStage({
    x: centerX - box.size / 2,
    y: centerY - box.size / 2,
    size: box.size,
  }, metrics, minCropSize);
};

export const moveCropBox = (
  box: CropBox,
  dx: number,
  dy: number,
  metrics: Pick<CropStageMetrics, 'stageWidth' | 'stageHeight'>,
  minCropSize: number,
) => clampCropBoxToStage({
  x: box.x + dx,
  y: box.y + dy,
  size: box.size,
}, metrics, minCropSize);

export const resizeCropBox = (
  box: CropBox,
  delta: number,
  metrics: Pick<CropStageMetrics, 'stageWidth' | 'stageHeight'>,
  minCropSize: number,
) => clampCropBoxToStage({
  x: box.x,
  y: box.y,
  size: box.size + delta,
}, metrics, minCropSize);

export const resizeCropBoxAroundCenter = (
  box: CropBox,
  delta: number,
  metrics: Pick<CropStageMetrics, 'stageWidth' | 'stageHeight'>,
  minCropSize: number,
) => {
  const centerX = box.x + box.size / 2;
  const centerY = box.y + box.size / 2;
  const nextSize = box.size - delta;
  return clampCropBoxToStage({
    x: centerX - nextSize / 2,
    y: centerY - nextSize / 2,
    size: nextSize,
  }, metrics, minCropSize);
};
