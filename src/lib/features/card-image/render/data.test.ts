import { describe, expect, test } from 'bun:test';
import { normalizeCardImageFormData } from '../layout';
import {
  applyAutoRarityStyle,
  createJpgRenderData,
  createPreviewRenderData,
  isFieldSpellRenderData,
} from './data';

describe('card render data helpers', () => {
  test('applies automatic rarity style only when custom colors are unset', () => {
    const styled = applyAutoRarityStyle(normalizeCardImageFormData({
      rare: 'ur',
      color: '',
      gradient: false,
    }));
    const custom = applyAutoRarityStyle(normalizeCardImageFormData({
      rare: 'ur',
      color: '#ffffff',
      gradient: false,
    }));

    expect(styled.color).toBe('#f3cc63');
    expect(styled.gradient).toBe(true);
    expect(custom.color).toBe('#ffffff');
    expect(custom.gradient).toBe(false);
  });

  test('builds isolated preview data for base builds', () => {
    const data = createPreviewRenderData({
      form: normalizeCardImageFormData({
        image: 'original-image',
        foregroundImage: 'foreground-image',
        foregroundWidth: 100,
        foregroundHeight: 120,
        effectBlockEnabled: true,
      }),
      croppedImageDataUrl: 'cropped-image',
    }, 0.05, { hasExtraBuild: false });

    expect(data.image).toBe('cropped-image');
    expect(data.scale).toBe(0.1);
    expect(data.foregroundImage).toBe('');
    expect(data.foregroundWidth).toBe(0);
    expect(data.effectBlockEnabled).toBe(false);
  });

  test('builds jpg data using export scale percent and detects field spells', () => {
    const data = createJpgRenderData({
      form: normalizeCardImageFormData({
        type: 'spell',
        icon: 'field',
      }),
      croppedImageDataUrl: 'cropped-image',
    }, 43, { hasExtraBuild: true });

    expect(data.scale).toBe(0.43);
    expect(isFieldSpellRenderData(data)).toBe(true);
  });
});
