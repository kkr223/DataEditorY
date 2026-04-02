<script lang="ts">
  import { onDestroy } from 'svelte';
  import { _ } from 'svelte-i18n';
  import { isCapabilityEnabled } from '$lib/application/capabilities/registry';
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
    shouldAutoConnectSettings,
  } from '$lib/features/settings/controller';
  import {
    autoConnectSettingsFlow,
    clearCoverImageFlow,
    clearSecretKeyFlow,
    connectSettingsAiFlow,
    getSettingsConnectionHint,
    openErrorLogFlow,
    pickCoverImageFlow,
    saveSelectedModelFlow,
    saveSettingsFlow,
  } from '$lib/features/settings/useCases';
  import SettingsAiCard from '$lib/features/settings/components/SettingsAiCard.svelte';
  import SettingsCoverAndLog from '$lib/features/settings/components/SettingsCoverAndLog.svelte';
  import SettingsHeader from '$lib/features/settings/components/SettingsHeader.svelte';
  import SettingsTemplateCard from '$lib/features/settings/components/SettingsTemplateCard.svelte';
  import { appSettingsState, loadAppSettings } from '$lib/stores/appSettings.svelte';
  import { SETTINGS_WORKSPACE_ID } from '$lib/core/workspace/store.svelte';

  const form = $state(createSettingsFormState());
  let isHydrated = $state(false);
  let triedAutoConnect = $state(false);
  const hasAiCapability = isCapabilityEnabled('ai');

  let settingsDescription = $derived($_(hasAiCapability ? 'settings.description_extra' : 'settings.description_base'));
  let connectionHint = $derived(getSettingsConnectionHint($_));
  let hasConnectionError = $derived(appSettingsState.connectionError !== '');
  let secretBadgeLabel = $derived(
    $_(appSettingsState.values.hasSecretKey ? 'settings.secret_saved' : 'settings.secret_missing'),
  );
  let secretPlaceholder = $derived(
    $_(
      appSettingsState.values.hasSecretKey
        ? 'settings.secret_placeholder_saved'
        : 'settings.secret_placeholder_empty',
    ),
  );

  async function handlePickCover() {
    await pickCoverImageFlow({ t: $_ });
  }

  async function handleClearCover() {
    await clearCoverImageFlow({ t: $_ });
  }

  async function handleSaveSettings() {
    await saveSettingsFlow({ form, t: $_ });
  }

  async function handleConnect() {
    await connectSettingsAiFlow({ form, hasAiCapability, t: $_ });
  }

  async function handleModelChange() {
    await saveSelectedModelFlow({ form, hasAiCapability, t: $_ });
  }

  async function handleClearSecretKey() {
    await clearSecretKeyFlow({ form, hasAiCapability, t: $_ });
  }

  async function handleOpenErrorLog() {
    await openErrorLogFlow({
      errorLogPath: appSettingsState.values.errorLogPath,
      t: $_,
    });
  }

  $effect(() => {
    void loadAppSettings();
  });

  $effect(() => {
    if (appSettingsState.loading || !appSettingsState.loaded) {
      return;
    }

    const nextState = hydrateSettingsForm(form, appSettingsState.values, { isHydrated });
    isHydrated = nextState.isHydrated;

    if (
      shouldAutoConnectSettings({
        hasAiCapability,
        triedAutoConnect,
        loading: appSettingsState.loading,
        loaded: appSettingsState.loaded,
        hasSecretKey: appSettingsState.values.hasSecretKey,
        apiBaseUrl: appSettingsState.values.apiBaseUrl,
      })
    ) {
      triedAutoConnect = true;
      void autoConnectSettingsFlow({
        values: appSettingsState.values,
        hasAiCapability,
        setModel: (model) => {
          form.model = model;
        },
      });
    }
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
      scriptTemplate={form.scriptTemplate}
      onScriptTemplateInput={(value) => {
        form.scriptTemplate = value;
      }}
      useExternalScriptEditor={form.useExternalScriptEditor}
      onExternalEditorChange={(value) => {
        form.useExternalScriptEditor = value;
      }}
    />

    {#if hasAiCapability}
      <SettingsAiCard
        title={$_('settings.ai_title')}
        description={$_('settings.ai_description')}
        badgeLabel={secretBadgeLabel}
        hasSecretKey={appSettingsState.values.hasSecretKey}
        baseUrlLabel={$_('settings.base_url')}
        secretKeyLabel={$_('settings.secret_key')}
        modelLabel={$_('settings.model')}
        temperatureLabel={$_('settings.temperature')}
        temperatureHint={$_('settings.temperature_hint')}
        connectHint={connectionHint}
        connectHintError={hasConnectionError}
        connectLabel={$_('settings.connect')}
        connectingLabel={$_('settings.connecting')}
        secretClearLabel={$_('settings.secret_clear')}
        modelPlaceholder={$_('settings.model_placeholder')}
        apiBaseUrl={form.apiBaseUrl}
        secretKey={form.secretKey}
        model={form.model}
        temperature={form.temperature}
        modelOptions={appSettingsState.modelOptions}
        connecting={appSettingsState.connecting}
        secretPlaceholder={secretPlaceholder}
        onApiBaseUrlInput={(value) => {
          form.apiBaseUrl = value;
        }}
        onSecretKeyInput={(value) => {
          form.secretKey = value;
        }}
        onModelInput={(value) => {
          form.model = value;
        }}
        onModelChange={handleModelChange}
        onTemperatureInput={(value) => {
          form.temperature = value;
        }}
        onConnect={handleConnect}
        onClearSecretKey={handleClearSecretKey}
      />
    {/if}
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
