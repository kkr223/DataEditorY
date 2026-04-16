import { get, fromStore } from 'svelte/store';
import { _ } from 'svelte-i18n';
import { tauriBridge } from '$lib/infrastructure/tauri';
import { copyCardAssets, createCdbFromCards } from '$lib/infrastructure/tauri/commands';
import {
  activeTab,
  getCachedFilters,
  openCdbPath,
  queryCardsByFiltersInTab,
  tabs,
} from '$lib/stores/db';
import { showToast } from '$lib/stores/toast.svelte';
import { writeErrorLog } from '$lib/utils/errorLog';
import type { CardDataEntry } from '$lib/types';
import { isNewOutputPath } from '$lib/features/shell/dialogsHelpers';
import { activateWorkspaceDocument } from '$lib/application/workspace/commandBus';

const activeTabState = fromStore(activeTab);
const tabsState = fromStore(tabs);

function t(key: string, options?: Record<string, unknown>) {
  return String(get(_)(key, options as never));
}

type FilterCdbDialogState = {
  isCreateFilteredCdbOpen: boolean;
  copyFilteredAssets: boolean;
  isCreatingFilteredCdb: boolean;
};

export function createFilterCdbController(state: FilterCdbDialogState) {
  async function getCurrentFilteredCards(): Promise<CardDataEntry[]> {
    if (!activeTabState.current) {
      return [];
    }

    return queryCardsByFiltersInTab(activeTabState.current.id, getCachedFilters());
  }

  async function handleCreateFilteredCdb() {
    const sourceCdbPath = activeTabState.current?.path ?? '';
    if (!sourceCdbPath) {
      showToast(t('editor.package_zip_no_cdb'), 'info');
      return;
    }

    state.isCreatingFilteredCdb = true;

    try {
      const filteredCards = await getCurrentFilteredCards();
      if (filteredCards.length === 0) {
        showToast(t('editor.create_filtered_cdb_empty'), 'info');
        return;
      }

      const outputPath = await tauriBridge.save({
        title: t('editor.create_filtered_cdb_title'),
        defaultPath: sourceCdbPath.replace(/\.cdb$/i, '-filtered.cdb'),
        filters: [{ name: 'YGOPro CDB Database', extensions: ['cdb'] }],
      });
      if (!outputPath || typeof outputPath !== 'string') {
        return;
      }
      if (!isNewOutputPath(outputPath, [sourceCdbPath, ...tabsState.current.map((tab) => tab.path)])) {
        showToast(t('editor.output_path_must_be_new'), 'error');
        return;
      }

      await createCdbFromCards(outputPath, filteredCards);
      const openedId = await openCdbPath(outputPath);
      if (openedId) {
        activateWorkspaceDocument(openedId);
      }

      if (state.copyFilteredAssets) {
        showToast(t('editor.create_filtered_cdb_copying_assets'), 'info');
        void copyCardAssets({
          sourceCdbPath,
          targetCdbPath: outputPath,
          cardIds: filteredCards.map((card) => card.code),
          includeImages: true,
          includeScripts: true,
        }).then(() => {
          showToast(t('editor.create_filtered_cdb_assets_copied'), 'success');
        }).catch((error) => {
          console.error('Failed to copy filtered cdb assets', error);
          void writeErrorLog({
            source: 'shell.create-filtered-cdb.copy-assets',
            error,
            extra: {
              sourceCdbPath,
              targetCdbPath: outputPath,
              cardCount: filteredCards.length,
            },
          });
          showToast(t('editor.create_filtered_cdb_assets_failed'), 'error');
        });
      }

      state.isCreateFilteredCdbOpen = false;
      showToast(
        t('editor.create_filtered_cdb_success', {
          values: { count: String(filteredCards.length) },
        }),
        'success',
      );
    } catch (error) {
      console.error('Failed to create filtered cdb', error);
      void writeErrorLog({
        source: 'shell.create-filtered-cdb',
        error,
        extra: { sourceCdbPath },
      });
      showToast(t('editor.create_filtered_cdb_failed'), 'error');
    } finally {
      state.isCreatingFilteredCdb = false;
    }
  }

  return {
    getCurrentFilteredCards,
    handleCreateFilteredCdb,
  };
}
