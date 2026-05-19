import { describe, expect, test } from 'bun:test';
import {
  calculateCropStageMetrics,
  clampCropBoxToStage,
  createCenteredCropBox,
  normalizeCropRotation,
  resizeCropBoxAroundCenter,
} from './geometry';

const expectCloseTo = (actual: number, expected: number) => {
  expect(Math.abs(actual - expected) < 0.001).toBe(true);
};

const baseStageInput = {
  sourceImageWidth: 400,
  sourceImageHeight: 200,
  rotation: 0,
  viewportWidth: 1200,
  viewportHeight: 900,
  bodyWidth: 1000,
  sidebarWidth: 320,
  minCropSize: 80,
  layoutBreakpoint: 980,
  layoutGap: 18,
  maxPreviewWidth: 900,
  maxPreviewHeight: 680,
};

describe('card image crop geometry', () => {
  test('normalizes rotation into the editor range', () => {
    expect(normalizeCropRotation(181)).toBe(-179);
    expect(normalizeCropRotation(-180)).toBe(180);
    expect(normalizeCropRotation(12.34)).toBe(12.3);
  });

  test('calculates rotated stage metrics', () => {
    const metrics = calculateCropStageMetrics({
      ...baseStageInput,
      rotation: 90,
    });

    expect(metrics.renderWidth).toBe(200);
    expect(metrics.renderHeight).toBe(400);
    expectCloseTo(metrics.stageWidth, 200);
    expectCloseTo(metrics.stageHeight, 400);
    expectCloseTo(metrics.imageOffsetX, -100);
    expectCloseTo(metrics.imageOffsetY, 100);
  });

  test('clamps crop boxes inside the stage', () => {
    expect(clampCropBoxToStage(
      { x: -20, y: 300, size: 500 },
      { stageWidth: 300, stageHeight: 240 },
      80,
    )).toEqual({ x: 0, y: 0, size: 240 });
  });

  test('creates and resizes crop boxes around the center', () => {
    const centered = createCenteredCropBox({ stageWidth: 300, stageHeight: 200 }, 80);
    expect(centered).toEqual({ x: 78, y: 28, size: 144 });

    const resized = resizeCropBoxAroundCenter(centered!, -40, { stageWidth: 300, stageHeight: 200 }, 80);
    expect(resized).toEqual({ x: 58, y: 8, size: 184 });
  });
});
