import type { CardDataEntry } from '$lib/types';
import { tauriBridge } from '$lib/infrastructure/tauri';
import { pickCardImageConfig, saveCardImageConfig } from '$lib/infrastructure/tauri/commands';
import { showToast } from '$lib/stores/toast.svelte';
import { writeErrorLog } from '$lib/utils/errorLog';
import {
  parseCardImageConfigDocument,
  serializeCardImageConfigDocument,
  type CardImageFormData,
  type CardImageLanguage,
} from '../layout';

export type CardImageConfigState = {
  form: CardImageFormData;
  configFileInput: HTMLInputElement | null;
  croppedImageDataUrl: string;
  sourceImageWidth: number;
  sourceImageHeight: number;
  cropModalOpen: boolean;
  cropRotation: number;
  cropBox: { x: number; y: number; size: number };
  dragMode: 'move' | 'resize' | null;
  dragPointerId: number | null;
  hasManualPreviewZoom: boolean;
  previewZoomPercent: number;
  exportScalePercent: number;
  lastFormLanguage: CardImageLanguage;
};

export type CardImageConfigControllerOptions = {
  state: CardImageConfigState;
  getCard: () => CardDataEntry;
  t: (key: string, options?: Record<string, unknown>) => string;
  defaultPreviewZoomPercent: number;
  clampExportScalePercent: (value: number) => number;
  getConfigFileName: () => string;
  revokeSourceImageUrl: () => void;
  syncForegroundRenderableUrl: (url: string) => Promise<void>;
  setInitialForegroundStateFromForm: (data: CardImageFormData) => void;
  destroyPreview: () => void;
  destroyForegroundPreview: () => void;
  warmupPreviewAfterFontsReady: () => Promise<void>;
};

export const createCardImageConfigController = ({
  state,
  getCard,
  t,
  defaultPreviewZoomPercent,
  clampExportScalePercent,
  getConfigFileName,
  revokeSourceImageUrl,
  syncForegroundRenderableUrl,
  setInitialForegroundStateFromForm,
  destroyPreview,
  destroyForegroundPreview,
  warmupPreviewAfterFontsReady,
}: CardImageConfigControllerOptions) => {
  const openConfigFilePicker = () => {
    state.configFileInput?.click();
  };

  const applyImportedConfigContent = async (content: string, sourceLabel: string) => {
    const card = getCard();
    try {
      const parsed = parseCardImageConfigDocument(content);
      const importedForm = parsed.form;

      revokeSourceImageUrl();
      state.sourceImageWidth = 0;
      state.sourceImageHeight = 0;
      state.cropModalOpen = false;
      state.cropRotation = 0;
      state.cropBox = { x: 0, y: 0, size: 0 };
      state.dragMode = null;
      state.dragPointerId = null;
      state.croppedImageDataUrl = importedForm.image || '';
      state.hasManualPreviewZoom = false;
      state.previewZoomPercent = defaultPreviewZoomPercent;
      if (parsed.exportScalePercent !== null) {
        state.exportScalePercent = clampExportScalePercent(parsed.exportScalePercent);
      }

      state.form = importedForm;
      state.lastFormLanguage = importedForm.language as CardImageLanguage;
      setInitialForegroundStateFromForm(importedForm);
      await syncForegroundRenderableUrl(importedForm.foregroundImage || '');
      destroyPreview();
      destroyForegroundPreview();
      await warmupPreviewAfterFontsReady();
      showToast(t('editor.card_image_config_import_success'), 'success');
    } catch (error) {
      console.error('Failed to import card image config', error);
      void writeErrorLog({
        source: 'card-image.config.import',
        error,
        extra: {
          cardCode: card.code ?? 0,
          source: sourceLabel,
        },
      });
      showToast(t('editor.card_image_config_import_failed'), 'error');
    }
  };

  const handleConfigImport = async () => {
    if (!tauriBridge.isTauri()) {
      openConfigFilePicker();
      return;
    }

    try {
      const selected = await pickCardImageConfig();
      if (!selected) return;
      await applyImportedConfigContent(selected.content, selected.path);
    } catch (error) {
      const card = getCard();
      console.error('Failed to read card image config', error);
      void writeErrorLog({
        source: 'card-image.config.read',
        error,
        extra: {
          cardCode: card.code ?? 0,
        },
      });
      showToast(t('editor.card_image_config_import_failed'), 'error');
    }
  };

  const handleConfigFileUpload = async (event: Event) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      await applyImportedConfigContent(content, file.name);
    } finally {
      input.value = '';
    }
  };

  const handleConfigExport = async () => {
    const card = getCard();
    try {
      const content = serializeCardImageConfigDocument({
        form: state.form,
        exportScalePercent: state.exportScalePercent,
        cardCode: Number(card.code ?? 0),
        cardName: card.name ?? '',
      });

      if (tauriBridge.isTauri()) {
        const targetPath = await saveCardImageConfig(getConfigFileName(), content);
        if (!targetPath) return;
      } else {
        const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = getConfigFileName();
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 0);
      }

      showToast(t('editor.card_image_config_export_success'), 'success');
    } catch (error) {
      console.error('Failed to export card image config', error);
      void writeErrorLog({
        source: 'card-image.config.export',
        error,
        extra: {
          cardCode: card.code ?? 0,
        },
      });
      showToast(t('editor.card_image_config_export_failed'), 'error');
    }
  };

  return {
    handleConfigExport,
    handleConfigFileUpload,
    handleConfigImport,
    openConfigFilePicker,
  };
};
