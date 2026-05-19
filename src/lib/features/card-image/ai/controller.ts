import type { CardDataEntry } from '$lib/types';
import { HAS_AI_FEATURE } from '$lib/config/build';
import { showToast } from '$lib/stores/toast.svelte';
import { tauriBridge } from '$lib/infrastructure/tauri';
import { createAiAppContext } from '$lib/services/aiAppContext';
import { writeErrorLog } from '$lib/utils/errorLog';
import {
  CARD_IMAGE_LANGUAGE_OPTIONS,
  type CardImageFormData,
} from '../layout';

export type CardImageAiState = {
  form: CardImageFormData;
  isTranslating: boolean;
};

export type CardImageAiControllerOptions = {
  state: CardImageAiState;
  getCard: () => CardDataEntry;
  updateForm: (patch: Partial<CardImageFormData>) => void;
  getOptionLabel: (option: { value: string; label?: string; labelKey?: string }) => string;
  t: (key: string, options?: Record<string, unknown>) => string;
};

export const createCardImageAiController = ({
  state,
  getCard,
  updateForm,
  getOptionLabel,
  t,
}: CardImageAiControllerOptions) => {
  const ensureAiReady = async () => {
    if (!HAS_AI_FEATURE) {
      return false;
    }

    try {
      await createAiAppContext().getAiConfig();
      return true;
    } catch {
      await tauriBridge.message(t('editor.ai_requires_secret_key'), {
        title: t('editor.ai_requires_secret_key_title'),
        kind: 'warning',
      });
      return false;
    }
  };

  const handleAiTranslate = async () => {
    const card = getCard();
    if (!(await ensureAiReady())) return;

    if (!state.form.name.trim() && !state.form.monsterType.trim() && !state.form.description.trim() && !state.form.pendulumDescription.trim()) {
      showToast(t('editor.card_image_ai_translate_empty'), 'info');
      return;
    }

    try {
      state.isTranslating = true;
      const { translateCardImageFields } = await import('$lib/utils/ai');
      const targetLanguageLabel = getOptionLabel(
        CARD_IMAGE_LANGUAGE_OPTIONS.find((option) => option.value === state.form.language) ?? {
          value: state.form.language,
          label: state.form.language,
        },
      );
      const translated = await translateCardImageFields({
        context: createAiAppContext(),
        currentCard: card,
        targetLanguage: targetLanguageLabel,
        name: state.form.name,
        monsterType: state.form.monsterType,
        description: state.form.description,
        pendulumDescription: state.form.pendulumDescription,
      });

      updateForm({
        name: translated.name ?? state.form.name,
        monsterType: translated.monsterType ?? state.form.monsterType,
        description: translated.description ?? state.form.description,
        pendulumDescription: translated.pendulumDescription ?? state.form.pendulumDescription,
      });
      showToast(t('editor.card_image_ai_translate_success'), 'success');
    } catch (error) {
      console.error('Failed to translate card image fields', error);
      void writeErrorLog({
        source: 'card-image.ai.translate',
        error,
        extra: {
          cardCode: card.code ?? 0,
          targetLanguage: state.form.language,
        },
      });
      showToast(t('editor.card_image_ai_translate_failed'), 'error');
    } finally {
      state.isTranslating = false;
    }
  };

  return {
    handleAiTranslate,
  };
};
