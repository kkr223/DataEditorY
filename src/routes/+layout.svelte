<script lang="ts">
  import { onMount, type Component } from 'svelte';
  import '../app.css';
  import { setupI18n } from '$lib/i18n';
  import { _, isLoading } from 'svelte-i18n';
  import { activeTab } from '$lib/stores/db';
  import Toast from '$lib/components/Toast.svelte';
  import AppTopBar from '$lib/features/shell/components/AppTopBar.svelte';
  import AppTabBar from '$lib/features/shell/components/AppTabBar.svelte';
  import FileDragOverlay from '$lib/features/shell/components/FileDragOverlay.svelte';
  import AssetCheckDialog from '$lib/features/shell/components/dialogs/AssetCheckDialog.svelte';
  import BatchCdbEditDialog from '$lib/features/shell/components/dialogs/BatchCdbEditDialog.svelte';
  import CreateFilteredCdbDialog from '$lib/features/shell/components/dialogs/CreateFilteredCdbDialog.svelte';
  import LuaReplaceDialog from '$lib/features/shell/components/dialogs/LuaReplaceDialog.svelte';
  import MergeCdbDialog from '$lib/features/shell/components/dialogs/MergeCdbDialog.svelte';
  import { createShellLayoutController } from '$lib/features/shell/layoutController.svelte';
  import { createShellDialogsController } from '$lib/features/shell/dialogsController.svelte';
  import { workspaceState } from '$lib/core/workspace/store.svelte';
  import {
    openSettingsWorkspace,
    saveWorkspaceDocument,
    saveWorkspaceDocumentAs,
  } from '$lib/application/workspace/commandBus';
  import { startDocumentStateSync } from '$lib/platform/store.svelte';
  import { documentRuntime } from '$lib/platform/appRuntime';

  setupI18n();

  let { children } = $props();
  const shellController = createShellLayoutController();
  const dialogsController = createShellDialogsController();
  let isBatchCdbEditOpen = $state(false);
  const extensionTools = documentRuntime.registry.findGlobalTools();
  let activeExtensionToolId = $state<string | null>(null);
  let loadedExtensionTool = $state<{ id: string; component: Component } | null>(null);
  let extensionToolLoadSequence = 0;
  let isLuaReplaceOpen = $state(false);
  let isAssetCheckOpen = $state(false);
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

  function openExtensionTool(id: string) {
    const tool = extensionTools.find((entry) => entry.id === id);
    if (!tool || (tool.requiresActiveCdb && !$activeTab?.path)) return;

    activeExtensionToolId = id;
    if (loadedExtensionTool?.id === id) return;
    const sequence = ++extensionToolLoadSequence;
    void tool.component()
      .then((module) => {
        if (sequence !== extensionToolLoadSequence || activeExtensionToolId !== id) return;
        loadedExtensionTool = { id, component: (module as { default: Component }).default };
      })
      .catch((error) => {
        if (sequence !== extensionToolLoadSequence) return;
        activeExtensionToolId = null;
        console.error(`Failed to load extension tool ${id}`, error);
      });
  }

  function closeExtensionTool() {
    activeExtensionToolId = null;
  }

  const topLevelWorkspaces = $derived(
    workspaceState.documents.filter((workspace) => workspace.kind === 'db' || workspace.kind === 'settings' || workspace.kind === 'text'),
  );

  const topLevelActiveWorkspaceId = $derived(
    topLevelWorkspaces.some((workspace) => workspace.id === workspaceState.activeWorkspaceId)
      ? workspaceState.activeWorkspaceId
      : $activeTab?.id ?? null,
  );

  onMount(() => {
    const stopDocumentSync = startDocumentStateSync();
    const cleanupShell = shellController.setup();
    const cleanupDialogs = dialogsController.setup();
    syncUiScale();
    window.addEventListener('resize', syncUiScale);

    return () => {
      cleanupShell?.();
      cleanupDialogs?.();
      stopDocumentSync();
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
      isMergeBusy={dialogsController.isMergeTaskRunning()}
      isPackageBusy={dialogsController.isPackageTaskRunning()}
      isOpenHistoryVisible={shellController.state.isOpenHistoryVisible}
      recentEntries={shellController.recentEntries.current}
      onOpen={shellController.handleOpen}
      onCreate={shellController.handleCreate}
      onCreateFilteredCdb={dialogsController.openCreateFilteredCdbDialog}
      onMergeCdb={dialogsController.openMergeCdbDialog}
      onBatchCdbEdit={() => { isBatchCdbEditOpen = true; }}
      onLuaReplace={() => { isLuaReplaceOpen = true; }}
      extensionTools={extensionTools.map((tool) => ({
        id: tool.id,
        label: $_(tool.labelKey),
        disabled: Boolean(tool.requiresActiveCdb && !$activeTab?.path),
      }))}
      onOpenExtensionTool={openExtensionTool}
      onAssetCheck={() => { isAssetCheckOpen = true; }}
      onOpenSettings={openSettingsWorkspace}
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
      workspaces={topLevelWorkspaces}
      activeWorkspaceId={topLevelActiveWorkspaceId}
      onActivateWorkspace={shellController.activateWorkspaceDocument}
      onSaveWorkspace={saveWorkspaceDocument}
      onSaveWorkspaceAs={saveWorkspaceDocumentAs}
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

    <BatchCdbEditDialog
      open={isBatchCdbEditOpen}
      onClose={() => { isBatchCdbEditOpen = false; }}
    />

    {#if loadedExtensionTool?.id === activeExtensionToolId}
      {@const ExtensionTool = loadedExtensionTool.component}
      <ExtensionTool open={true} onClose={closeExtensionTool} />
    {/if}

    <AssetCheckDialog
      open={isAssetCheckOpen}
      onClose={() => { isAssetCheckOpen = false; }}
    />

    <LuaReplaceDialog
      open={isLuaReplaceOpen}
      onClose={() => { isLuaReplaceOpen = false; }}
    />

    <MergeCdbDialog
      open={dialogsController.state.isMergeCdbOpen}
      state={dialogsController.state}
      onClose={dialogsController.closeMergeCdbDialog}
      onPickFiles={dialogsController.pickMergeFiles}
      onPickFolder={dialogsController.pickMergeFolder}
      onRemoveSource={dialogsController.removeMergeSource}
      onMoveSource={dialogsController.moveMergeSource}
      onReorderSource={dialogsController.reorderMergeSource}
      onSetIncludeImages={dialogsController.setMergeIncludeImages}
      onSetIncludeScripts={dialogsController.setMergeIncludeScripts}
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
