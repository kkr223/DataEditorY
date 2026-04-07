<script lang="ts">
  import { onMount } from 'svelte';
  import '../app.css';
  import { setupI18n } from '$lib/i18n';
  import { _, isLoading } from 'svelte-i18n';
  import { activeTab } from '$lib/stores/db';
  import { openSettingsView } from '$lib/stores/appShell.svelte';
  import Toast from '$lib/components/Toast.svelte';
  import AppTopBar from '$lib/features/shell/components/AppTopBar.svelte';
  import AppTabBar from '$lib/features/shell/components/AppTabBar.svelte';
  import FileDragOverlay from '$lib/features/shell/components/FileDragOverlay.svelte';
  import CreateFilteredCdbDialog from '$lib/features/shell/components/dialogs/CreateFilteredCdbDialog.svelte';
  import MergeCdbDialog from '$lib/features/shell/components/dialogs/MergeCdbDialog.svelte';
  import { createShellLayoutController } from '$lib/features/shell/layoutController.svelte';
  import { createShellDialogsController } from '$lib/features/shell/dialogsController.svelte';
  import { workspaceState } from '$lib/core/workspace/store.svelte';

  setupI18n();

  let { children } = $props();
  const shellController = createShellLayoutController();
  const dialogsController = createShellDialogsController();
  const REFERENCE_VIEWPORT_WIDTH = 1920;
  const REFERENCE_VIEWPORT_HEIGHT = 1080;
  const DESIGN_SCALE_BIAS = 1.2;
  const SCALE_CURVE_EXPONENT = 0.4;
  const MIN_UI_SCALE = 0.82;
  const MAX_UI_SCALE = 1.32;

  function syncUiScale() {
    const widthScale = window.innerWidth / REFERENCE_VIEWPORT_WIDTH;
    const heightScale = window.innerHeight / REFERENCE_VIEWPORT_HEIGHT;
    const rawScale = Math.min(widthScale, heightScale);
    const curvedScale = Math.pow(rawScale, SCALE_CURVE_EXPONENT);
    const nextScale = Math.min(
      MAX_UI_SCALE,
      Math.max(MIN_UI_SCALE, curvedScale * DESIGN_SCALE_BIAS),
    );
    document.documentElement.style.setProperty('--ui-scale', String(nextScale));
  }

  onMount(() => {
    shellController.setup();
    syncUiScale();
    window.addEventListener('resize', syncUiScale);

    return () => {
      window.removeEventListener('resize', syncUiScale);
      document.documentElement.style.removeProperty('--ui-scale');
    };
  });
</script>

<Toast />

{#if $isLoading}
  <div class="loading-shell">
    Loading translations...
  </div>
{:else}
  <div class="app-container">
    <AppTopBar
      theme={shellController.state.theme}
      hasActiveCdb={Boolean($activeTab?.path)}
      hasPackageTarget={Boolean(dialogsController.getCurrentPackageCdbPath())}
      isOpenHistoryVisible={shellController.state.isOpenHistoryVisible}
      recentEntries={shellController.recentEntries.current}
      onOpen={shellController.handleOpen}
      onCreate={shellController.handleCreate}
      onCreateFilteredCdb={dialogsController.openCreateFilteredCdbDialog}
      onMergeCdb={dialogsController.openMergeCdbDialog}
      onOpenSettings={openSettingsView}
      onPackageZip={dialogsController.handlePackageZip}
      onPackageYpk={dialogsController.handlePackageYpk}
      onShowPackageMenu={dialogsController.showPackageMenu}
      onHidePackageMenu={dialogsController.hidePackageMenu}
      isPackageMenuVisible={dialogsController.state.isPackageMenuVisible}
      onToggleTheme={shellController.toggleTheme}
      onToggleLanguage={shellController.toggleLanguage}
      onShowOpenHistory={shellController.showOpenHistory}
      onHideOpenHistory={shellController.hideOpenHistoryWithDelay}
      onHideOpenHistoryImmediately={shellController.hideOpenHistoryImmediately}
      onOpenRecent={shellController.handleOpenRecent}
      onRemoveRecent={shellController.handleRemoveRecent}
    />

    <AppTabBar
      workspaces={workspaceState.documents}
      activeWorkspaceId={workspaceState.activeWorkspaceId}
      onActivateWorkspace={shellController.activateWorkspaceDocument}
      onCloseWorkspace={shellController.handleCloseWorkspace}
      onOpenAnother={shellController.handleOpen}
    />

    <main class="main-content">
      {@render children()}
      <FileDragOverlay
        active={shellController.state.isFileDragActive}
        message={shellController.state.dragOverlayMessage || $_('nav.drag_open_cdb')}
        hint={$_('nav.drag_open_cdb_hint')}
      />
    </main>

    <CreateFilteredCdbDialog
      open={dialogsController.state.isCreateFilteredCdbOpen}
      state={dialogsController.state}
      onClose={dialogsController.closeCreateFilteredCdbDialog}
      onConfirm={dialogsController.handleCreateFilteredCdb}
    />

    <MergeCdbDialog
      open={dialogsController.state.isMergeCdbOpen}
      state={dialogsController.state}
      onClose={dialogsController.closeMergeCdbDialog}
      onPickPath={dialogsController.pickMergePath}
      onAnalyze={dialogsController.handleAnalyzeMerge}
      onConfirm={dialogsController.handleExecuteMerge}
    />
  </div>
{/if}

<style>
  .loading-shell {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100vh;
    color: var(--text-secondary);
  }

  .app-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100vw;
  }

  .main-content {
    flex: 1;
    overflow: hidden;
    background-color: var(--bg-base);
    position: relative;
  }
</style>
