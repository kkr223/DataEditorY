import type { CardDataEntry } from '$lib/types';
import {
  normalizeCardImageFormData,
  type CardImageFormData,
} from '../layout';

export type ColorPreset = { value: string; labelKey: string };

type LabelOption = { value: string; label?: string; labelKey?: string };

export type CardImageFormState = {
  form: CardImageFormData;
};

export type CardImageFormControllerOptions = {
  state: CardImageFormState;
  getCard: () => CardDataEntry;
  t: (key: string, options?: Record<string, unknown>) => string;
};

export const MIN_EXPORT_SCALE_PERCENT = 10;
export const MAX_EXPORT_SCALE_PERCENT = 100;
export const DEFAULT_EXPORT_SCALE_PERCENT = 43;

export const NAME_COLOR_PRESETS: ColorPreset[] = [
  { value: '#ffffff', labelKey: 'editor.card_image_color_preset_white' },
  { value: '#d8dee9', labelKey: 'editor.card_image_color_preset_silver' },
  { value: '#f3c969', labelKey: 'editor.card_image_color_preset_gold' },
  { value: '#1f2937', labelKey: 'editor.card_image_color_preset_black' },
  { value: '#ef4444', labelKey: 'editor.card_image_color_preset_red' },
  { value: '#60a5fa', labelKey: 'editor.card_image_color_preset_blue' },
  { value: '#34d399', labelKey: 'editor.card_image_color_preset_green' },
  { value: '#c084fc', labelKey: 'editor.card_image_color_preset_purple' },
];

export const clampExportScalePercent = (value: number) => (
  Math.max(MIN_EXPORT_SCALE_PERCENT, Math.min(MAX_EXPORT_SCALE_PERCENT, Math.round(value)))
);

const normalizeColorValue = (value: string) => value.trim().toLowerCase();

export const createCardImageFormController = ({
  state,
  getCard,
  t,
}: CardImageFormControllerOptions) => {
  const updateForm = (patch: Partial<CardImageFormData>) => {
    state.form = normalizeCardImageFormData({
      ...state.form,
      ...patch,
    });
  };

  const clearCustomNameColor = () => {
    updateForm({
      color: '',
      gradient: false,
      gradientColor1: '#999999',
      gradientColor2: '#ffffff',
    });
  };

  const clearCustomNameShadowColor = () => {
    updateForm({
      nameShadowColor: '',
      nameShadowGradient: false,
      nameShadowGradientColor1: '#1f2937',
      nameShadowGradientColor2: '#0f172a',
    });
  };

  const applyNameColorPreset = (color: string) => {
    updateForm({
      color,
      gradientColor1: color,
      gradientColor2: color,
    });
  };

  const isNameColorPresetActive = (color: string) => (
    normalizeColorValue(state.form.color) === normalizeColorValue(color)
  );

  const applyNameShadowColorPreset = (color: string) => {
    updateForm({
      nameShadowColor: color,
      nameShadowGradientColor1: color,
      nameShadowGradientColor2: color,
    });
  };

  const isNameShadowColorPresetActive = (color: string) => (
    normalizeColorValue(state.form.nameShadowColor) === normalizeColorValue(color)
  );

  const getOptionLabel = (option: LabelOption) => {
    if (option.labelKey) return t(option.labelKey);
    return option.label ?? option.value;
  };

  const getConfigFileName = () => {
    const card = getCard();
    const code = String(state.form.password || card.code || 'card-image').trim() || 'card-image';
    return `${code}-card-image.json`;
  };

  return {
    applyNameColorPreset,
    applyNameShadowColorPreset,
    clearCustomNameColor,
    clearCustomNameShadowColor,
    getConfigFileName,
    getOptionLabel,
    isNameColorPresetActive,
    isNameShadowColorPresetActive,
    updateForm,
  };
};
