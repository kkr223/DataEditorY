import { get, fromStore } from 'svelte/store';
import { _ } from 'svelte-i18n';
import { tauriBridge } from '$lib/infrastructure/tauri';
import { packageCdbAssetsAsZip } from '$lib/infrastructure/tauri/commands';
import { activeTab } from '$lib/stores/db';
import { activeScriptTab } from '$lib/stores/scriptEditor.svelte';
import { appShellState } from '$lib/stores/appShell.svelte';
import { showToast } from '$lib/stores/toast.svelte';
import { writeErrorLog } from '$lib/utils/errorLog';
import { workspaceState } from '$lib/core/workspace/store.svelte';
import { saveWorkspaceDocument } from '$lib/application/workspace/commandBus';

const activeTabState = fromStore(activeTab);
const activeScriptTabState = fromStore(activeScriptTab);

function t(key: string, options?: Record<string, unknown>) {
  return String(get(_)(key, options as never));
}

type PackageDialogState = {
  isPackageMenuVisible: boolean;
};

type EnqueueBackgroundTaskInput = {
  task: 'merge' | 'package';
  format?: 'zip' | 'ypk';
  run: () => Promise<void>;
};

export function createPackageController(
  state: PackageDialogState,
  enqueueBackgroundTask: (input: EnqueueBackgroundTaskInput) => void,
) {
  function getCurrentPackageCdbPath() {
    if (appShellState.mainView === 'script' && activeScriptTabState.current?.cdbPath) {
      return activeScriptTabState.current.cdbPath;
    }

    return activeTabState.current?.path ?? null;
  }

  async function ensureCurrentContextSavedForPackaging(targetCdbPath: string) {
    const activeScriptWorkspace = activeScriptTabState.current
      ? workspaceState.documents.find((document) => document.id === activeScriptTabState.current?.id) ?? null
      : null;

    if (
      appShellState.mainView === 'script'
      && activeScriptTabState.current?.cdbPath === targetCdbPath
      && activeScriptWorkspace?.dirty
    ) {
      const confirmed = await tauriBridge.ask(t('editor.package_zip_unsaved_script_confirm'), {
        title: t('editor.package_zip_unsaved_title'),
        kind: 'warning',
      });
      if (!confirmed) return false;

      const ok = await saveWorkspaceDocument(activeScriptWorkspace.id);
      if (!ok) {
        showToast(t('editor.script_save_failed'), 'error');
        return false;
      }
    }

    const sourceWorkspace = workspaceState.documents.find(
      (document) => document.kind === 'db' && document.source.path === targetCdbPath,
    ) ?? null;

    if (sourceWorkspace?.dirty) {
      const confirmed = await tauriBridge.ask(
        t('editor.package_zip_unsaved_cdb_confirm', {
          values: { name: sourceWorkspace.title },
        }),
        {
          title: t('editor.package_zip_unsaved_title'),
          kind: 'warning',
        },
      );
      if (!confirmed) return false;

      const ok = await saveWorkspaceDocument(sourceWorkspace.id);
      if (!ok) {
        showToast(t('editor.save_failed'), 'error');
        return false;
      }
    }

    return true;
  }

  async function handlePackageZip() {
    return handlePackageAs('zip');
  }

  async function handlePackageYpk() {
    return handlePackageAs('ypk');
  }

  function showPackageMenu() {
    state.isPackageMenuVisible = true;
  }

  function hidePackageMenu() {
    state.isPackageMenuVisible = false;
  }

  async function handlePackageAs(format: 'zip' | 'ypk') {
    const cdbPath = getCurrentPackageCdbPath();
    if (!cdbPath) {
      showToast(t('editor.package_zip_no_cdb'), 'info');
      return;
    }

    if (!(await ensureCurrentContextSavedForPackaging(cdbPath))) {
      return;
    }

    const outputPath = await tauriBridge.save({
      defaultPath: cdbPath.replace(/\.cdb$/i, `.${format}`),
      filters: [{ name: format.toUpperCase(), extensions: [format] }],
    });
    if (!outputPath) {
      return;
    }

    enqueueBackgroundTask({
      task: 'package',
      format,
      run: async () => {
        try {
          const result = await packageCdbAssetsAsZip(cdbPath, outputPath);
          showToast(
            t(
              format === 'zip' ? 'editor.background_package_zip_completed' : 'editor.background_package_ypk_completed',
              { values: { path: result.path } },
            ),
            'success',
            4200,
          );
        } catch (error) {
          console.error(`Failed to package cdb assets as ${format}`, error);
          void writeErrorLog({
            source: format === 'zip' ? 'shell.package-cdb-assets-as-zip' : 'shell.package-cdb-assets-as-ypk',
            error,
            extra: { cdbPath, outputPath },
          });
          showToast(
            t(format === 'zip' ? 'editor.background_package_zip_failed' : 'editor.background_package_ypk_failed'),
            'error',
            4200,
          );
        }
      },
    });
  }

  return {
    getCurrentPackageCdbPath,
    ensureCurrentContextSavedForPackaging,
    handlePackageZip,
    handlePackageYpk,
    showPackageMenu,
    hidePackageMenu,
    handlePackageAs,
  };
}
