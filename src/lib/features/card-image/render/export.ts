import type { CardDataEntry } from '$lib/types';
import { tauriBridge } from '$lib/infrastructure/tauri';
import { pathExists, writeBinaryFile } from '$lib/infrastructure/tauri/commands';
import { showToast } from '$lib/stores/toast.svelte';
import { getPicsDir } from '$lib/services/cardImageService';
import type { CardImageFormData } from '../layout';
import { blobToUint8Array, renderSquareJpgBlob } from './blob';
import { isFieldSpellRenderData } from './data';

const FIELD_SPELL_ART_SIZE = 512;

type CardImageExportState = {
  form: CardImageFormData;
  croppedImageDataUrl: string;
  isDownloading: boolean;
  isSavingJpg: boolean;
};

export type CardImageExportActionsOptions = {
  state: CardImageExportState;
  getCard: () => CardDataEntry;
  getCdbPath: () => string;
  onSavedJpg: () => void | Promise<void>;
  t: (key: string, options?: Record<string, unknown>) => string;
  buildPngData: () => CardImageFormData;
  buildJpgData: () => CardImageFormData;
  renderCardBlob: (data: CardImageFormData, type: 'png' | 'jpg', quality?: number) => Promise<Blob>;
};

const isPositiveCardCode = (value: unknown) => (
  typeof value === 'number' && Number.isFinite(value) && value > 0
);

export const createCardImageExportActions = ({
  state,
  getCard,
  getCdbPath,
  onSavedJpg,
  t,
  buildPngData,
  buildJpgData,
  renderCardBlob,
}: CardImageExportActionsOptions) => {
  const handleDownload = async () => {
    const card = getCard();
    state.isDownloading = true;

    try {
      const pngBlob = await renderCardBlob(buildPngData(), 'png');

      const targetPath = await tauriBridge.save({
        defaultPath: `${state.form.password || card.code || 'card'}.png`,
        filters: [{ name: 'PNG', extensions: ['png'] }],
      });
      if (!targetPath) return;

      const bytes = await blobToUint8Array(pngBlob);
      await writeBinaryFile(targetPath, Array.from(bytes));
      showToast(t('editor.card_image_download_success'), 'success');
    } catch (error) {
      console.error('Failed to download generated card image', error);
      showToast(t('editor.card_image_download_failed'), 'error');
    } finally {
      state.isDownloading = false;
    }
  };

  const handleSaveJpg = async () => {
    const cdbPath = getCdbPath();
    const card = getCard();
    if (!cdbPath) {
      showToast(t('editor.card_image_save_jpg_missing_cdb'), 'error');
      return;
    }

    if (!isPositiveCardCode(card.code)) {
      showToast(t('editor.code_required'), 'error');
      return;
    }

    state.isSavingJpg = true;

    try {
      const picsDir = await getPicsDir(cdbPath);
      const picPath = await tauriBridge.join(picsDir, `${card.code}.jpg`);
      const fieldPicPath = await tauriBridge.join(picsDir, 'field', `${card.code}.jpg`);
      const jpgData = buildJpgData();

      let shouldOverwrite = true;
      if (await pathExists(picPath)) {
        shouldOverwrite = await tauriBridge.ask(t('editor.card_image_save_jpg_overwrite_confirm', {
          values: { code: String(card.code) },
        }), {
          title: t('editor.card_image_save_jpg_overwrite_title'),
          kind: 'warning',
        });
      }

      if (!shouldOverwrite) return;

      const jpgBlob = await renderCardBlob(jpgData, 'jpg', 0.92);
      const bytes = await blobToUint8Array(jpgBlob);

      let fieldArtBytes: Uint8Array | null = null;
      if (isFieldSpellRenderData(jpgData) && state.croppedImageDataUrl) {
        const fieldArtBlob = await renderSquareJpgBlob(state.croppedImageDataUrl, FIELD_SPELL_ART_SIZE, 0.92);
        fieldArtBytes = await blobToUint8Array(fieldArtBlob);
      }

      await writeBinaryFile(picPath, Array.from(bytes));
      if (fieldArtBytes) {
        await writeBinaryFile(fieldPicPath, Array.from(fieldArtBytes));
      }
      await onSavedJpg();
      showToast(t('editor.card_image_save_jpg_success', {
        values: { code: String(card.code) },
      }), 'success');
    } catch (error) {
      console.error('Failed to save rendered JPG to pics', error);
      showToast(t('editor.card_image_save_jpg_failed'), 'error');
    } finally {
      state.isSavingJpg = false;
    }
  };

  return {
    handleDownload,
    handleSaveJpg,
  };
};
