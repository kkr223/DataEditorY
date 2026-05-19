import { describe, expect, test } from 'bun:test';
import {
  calculateDefaultForegroundScale,
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
  hasForegroundImage,
  moveForegroundFromDrag,
  rotateForegroundFromDrag,
  scaleForegroundFromDrag,
} from './geometry';

const expectCloseTo = (actual: number, expected: number) => {
  expect(Math.abs(actual - expected) < 0.001).toBe(true);
};

const currentForegroundState = {
  foregroundWidth: 100,
  foregroundHeight: 120,
  foregroundX: 111,
  foregroundY: 222,
  foregroundScale: 3,
  foregroundRotation: 45,
};

describe('card image foreground geometry', () => {
  test('calculates editor scale from preview bounds', () => {
    expect(calculateForegroundEditorScale({ previewWidth: 0, previewHeight: 680 })).toBe(0.32);
    expectCloseTo(
      calculateForegroundEditorScale({ previewWidth: 420, previewHeight: 680 }),
      (420 - 64) / FOREGROUND_EDITOR_CARD_WIDTH,
    );
  });

  test('detects foreground images and restores initial state from form data', () => {
    expect(hasForegroundImage({
      foregroundImage: '',
      foregroundWidth: 100,
      foregroundHeight: 100,
    })).toBe(false);

    const formState = {
      foregroundImage: 'data:image/png;base64,abc',
      ...currentForegroundState,
    };

    expect(hasForegroundImage(formState)).toBe(true);
    expect(createForegroundInitialStateFromForm(formState)).toEqual(currentForegroundState);
  });

  test('creates empty and upload initial foreground states', () => {
    expect(createEmptyForegroundState()).toEqual({
      foregroundWidth: 0,
      foregroundHeight: 0,
      foregroundX: FOREGROUND_EDITOR_CARD_WIDTH / 2,
      foregroundY: FOREGROUND_EDITOR_CARD_HEIGHT / 2,
      foregroundScale: 1,
      foregroundRotation: 0,
    });

    expect(createForegroundUploadInitialState({
      width: 500,
      height: 400,
      isReplacing: true,
      currentState: currentForegroundState,
    })).toEqual({
      ...currentForegroundState,
      foregroundWidth: 500,
      foregroundHeight: 400,
    });

    expect(createForegroundUploadInitialState({
      width: 500,
      height: 400,
      isReplacing: false,
      currentState: currentForegroundState,
    })).toEqual({
      foregroundWidth: 500,
      foregroundHeight: 400,
      foregroundX: FOREGROUND_EDITOR_CARD_WIDTH / 2,
      foregroundY: FOREGROUND_EDITOR_CARD_HEIGHT / 2,
      foregroundScale: 1,
      foregroundRotation: 0,
    });
  });

  test('clamps default foreground scale', () => {
    expect(calculateDefaultForegroundScale(0, 100)).toBe(1);
    expect(calculateDefaultForegroundScale(100, 100)).toBe(1);
    expect(calculateDefaultForegroundScale(100000, 100000)).toBe(0.05);
  });

  test('creates foreground selection styles from render bounds', () => {
    const style = createForegroundSelectionStyle({
      data: {
        foregroundWidth: 100,
        foregroundHeight: 50,
        foregroundX: 100,
        foregroundY: 200,
        foregroundScale: 2,
        foregroundRotation: 30,
      },
      bounds: {
        width: FOREGROUND_EDITOR_CARD_WIDTH / 2,
        height: FOREGROUND_EDITOR_CARD_HEIGHT / 2,
        offsetX: 10,
        offsetY: 20,
      },
    });

    expect(style).toBe('left:10px;top:95px;width:100px;height:50px;transform:rotate(30deg)');
  });

  test('calculates render bounds with host fallbacks', () => {
    expect(calculateForegroundRenderBounds({
      contentWidth: 0,
      contentHeight: 0,
      hostWidth: 420,
      hostHeight: 680,
      contentOffsetX: 12,
      contentOffsetY: 18,
    })).toEqual({
      width: 420,
      height: 680,
      offsetX: 12,
      offsetY: 18,
    });
  });

  test('calculates pointer drag transforms', () => {
    expectCloseTo(calculatePointerAngle({ x: 0, y: 1 }, { x: 0, y: 0 }), 90);
    expect(calculatePointerDistance({ x: 0, y: 0 }, { x: 0, y: 0 })).toBe(1);

    expect(moveForegroundFromDrag({
      pointer: { x: 130, y: 80 },
      startPointer: { x: 100, y: 100 },
      startPosition: { x: 10, y: 20 },
      editorScale: 2,
    })).toEqual({
      foregroundX: 25,
      foregroundY: 10,
    });

    expect(scaleForegroundFromDrag({
      pointer: { x: 20, y: 0 },
      center: { x: 0, y: 0 },
      startScale: 2,
      startDistance: 10,
    })).toEqual({ foregroundScale: 4 });

    expectCloseTo(rotateForegroundFromDrag({
      pointer: { x: 0, y: 1 },
      center: { x: 0, y: 0 },
      startRotation: 30,
      startAngle: 0,
    }).foregroundRotation, 120);
  });
});
