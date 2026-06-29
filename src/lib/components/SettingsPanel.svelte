<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { _ } from 'svelte-i18n';
  import {
    clearWorkspaceLifecycleMetadata,
    clearWorkspaceSaveHandler,
    setWorkspaceLifecycleMetadata,
    setWorkspaceSaveHandler,
  } from '$lib/application/workspace/lifecycle';
  import {
    createSettingsFormState,
    hydrateSettingsForm,
    isSettingsFormDirty,
  } from '$lib/features/settings/controller';
  import {
    clearCoverImageFlow,
    openErrorLogFlow,
    pickCoverImageFlow,
    saveSettingsFlow,
  } from '$lib/features/settings/useCases';
  import SettingsCoverAndLog from '$lib/features/settings/components/SettingsCoverAndLog.svelte';
  import SettingsHeader from '$lib/features/settings/components/SettingsHeader.svelte';
  import SettingsPackageCard from '$lib/features/settings/components/SettingsPackageCard.svelte';
  import SettingsShortcutsCard from '$lib/features/settings/components/SettingsShortcutsCard.svelte';
  import SettingsTemplateCard from '$lib/features/settings/components/SettingsTemplateCard.svelte';
  import SettingsSections from '$lib/platform/components/SettingsSections.svelte';
  import { documentRuntime } from '$lib/platform/appRuntime';
  import type { SettingsWorkbenchContext } from '$lib/modules/settings/workbench/context';
  import { appSettingsState, loadAppSettings } from '$lib/stores/appSettings.svelte';
  import { SETTINGS_WORKSPACE_ID } from '$lib/core/workspace/store.svelte';

  const form = $state(createSettingsFormState());
  let isHydrated = $state(false);
  const hasContributedSettings = documentRuntime.registry.findSettingsSections().length > 0;
  let settingsDescription = $derived($_(hasContributedSettings
    ? 'settings.description_extra'
    : 'settings.description_base'));
  const settingsWorkbenchContext = $derived.by((): SettingsWorkbenchContext => ({
    form,
    t: (key, options) => $_(key, options as never),
  }));

  async function handlePickCover() {
    await pickCoverImageFlow({ t: $_ });
  }

  async function handleClearCover() {
    await clearCoverImageFlow({ t: $_ });
  }

  async function handleSaveSettings() {
    await saveSettingsFlow({ form, t: $_ });
  }

  async function handleOpenErrorLog() {
    await openErrorLogFlow({
      errorLogPath: appSettingsState.values.errorLogPath,
      t: $_,
    });
  }

  onMount(() => {
    void loadAppSettings().catch(() => undefined);
  });

  $effect(() => {
    if (appSettingsState.loading || !appSettingsState.loaded) {
      return;
    }

    const nextState = hydrateSettingsForm(form, appSettingsState.values, { isHydrated });
    isHydrated = nextState.isHydrated;
  });

  $effect(() => {
    setWorkspaceSaveHandler(SETTINGS_WORKSPACE_ID, () => saveSettingsFlow({ form, t: $_ }));

    return () => {
      clearWorkspaceSaveHandler(SETTINGS_WORKSPACE_ID);
    };
  });

  $effect(() => {
    const dirty = isHydrated && isSettingsFormDirty(form, appSettingsState.values);

    setWorkspaceLifecycleMetadata(SETTINGS_WORKSPACE_ID, {
      dirty,
      savePolicy: 'manual',
      closeGuard: dirty ? 'confirm-dirty' : 'none',
    });
  });

  onDestroy(() => {
    clearWorkspaceLifecycleMetadata(SETTINGS_WORKSPACE_ID);
    clearWorkspaceSaveHandler(SETTINGS_WORKSPACE_ID);
  });
</script>

<section class="sp">
  <SettingsHeader
    title={$_('settings.title')}
    description={settingsDescription}
    saveLabel={$_('settings.save')}
    savingLabel={$_('settings.saving')}
    saving={appSettingsState.saving}
    onSave={handleSaveSettings}
  />

  <div class="sp-body">
    <SettingsCoverAndLog
      coverImageSrc={appSettingsState.coverImageSrc}
      coverTitle={$_('settings.cover_title')}
      coverDescription={$_('settings.cover_description')}
      coverPickLabel={$_('settings.cover_pick')}
      coverResetLabel={$_('settings.cover_reset')}
      errorLogTitle={$_('settings.error_log_title')}
      errorLogDescription={$_('settings.error_log_description')}
      errorLogPath={appSettingsState.values.errorLogPath}
      errorLogOpenLabel={$_('settings.error_log_open')}
      onPickCover={handlePickCover}
      onClearCover={handleClearCover}
      onOpenErrorLog={handleOpenErrorLog}
    />

    <SettingsTemplateCard
      title={$_('settings.script_template_title')}
      description={$_('settings.script_template_description')}
      externalEditorLabel={$_('settings.use_external_script_editor')}
      externalEditorHint={$_('settings.use_external_script_editor_hint')}
      saveScriptImageToLocalLabel={$_('settings.save_script_image_to_local')}
      saveScriptImageToLocalHint={$_('settings.save_script_image_to_local_hint')}
      ygoproPathLabel={$_('settings.ygopro_path')}
      ygoproPathHint={$_('settings.ygopro_path_hint')}
      scriptDirectoryLabel={$_('settings.script_directory')}
      scriptDirectoryHint={$_('settings.script_directory_hint')}
      ygoproPath={form.ygoproPath}
      scriptDirectory={form.scriptDirectory}
      scriptTemplate={form.scriptTemplate}
      onYgoproPathInput={(value) => {
        form.ygoproPath = value;
      }}
      onScriptDirectoryInput={(value) => {
        form.scriptDirectory = value;
      }}
      onScriptTemplateInput={(value) => {
        form.scriptTemplate = value;
      }}
      useExternalScriptEditor={form.useExternalScriptEditor}
      onExternalEditorChange={(value) => {
        form.useExternalScriptEditor = value;
      }}
      saveScriptImageToLocal={form.saveScriptImageToLocal}
      onSaveScriptImageToLocalChange={(value) => {
        form.saveScriptImageToLocal = value;
      }}
    />

    <SettingsPackageCard
      title={$_('settings.package_include_title')}
      description={$_('settings.package_include_description')}
      hint={$_('settings.package_include_hint')}
      patternsText={form.packageIncludePatternsText}
      onPatternsInput={(value) => {
        form.packageIncludePatternsText = value;
      }}
    />

    <SettingsShortcutsCard
      title={$_('settings.shortcuts_title')}
      description={$_('settings.shortcuts_description')}
      recordLabel={$_('settings.shortcuts_record')}
      recordingLabel={$_('settings.shortcuts_recording')}
      resetLabel={$_('settings.shortcuts_reset')}
      resetAllLabel={$_('settings.shortcuts_reset_all')}
      defaultLabel={$_('settings.shortcuts_default')}
      conflictLabel={$_('settings.shortcuts_conflict')}
      pressHint={$_('settings.shortcuts_hint')}
      shortcutBindings={form.shortcutBindings}
      onShortcutBindingsChange={(bindings) => {
        form.shortcutBindings = bindings;
      }}
    />

    <SettingsSections context={settingsWorkbenchContext} />
  </div>
</section>

<style>
  .sp {
    height: 100%;
    overflow: auto;
    padding: 14px 18px 22px;
    display: flex;
    flex-direction: column;
    gap: 0;
    background:
      radial-gradient(ellipse 55% 45% at 85% 0%, rgba(34, 197, 94, 0.07), transparent),
      radial-gradient(ellipse 45% 55% at 0% 8%, rgba(99, 102, 241, 0.07), transparent),
      var(--bg-base);
  }

  .sp-body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
</style>
