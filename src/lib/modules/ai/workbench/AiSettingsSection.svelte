<script lang="ts">
  import { onMount } from 'svelte';
  import type { SettingsWorkbenchContext } from '$lib/modules/settings/workbench/context';
  import { appSettingsState } from '$lib/stores/appSettings.svelte';
  import {
    autoConnectSettingsFlow,
    clearSecretKeyFlow,
    connectSettingsAiFlow,
    saveSelectedModelFlow,
  } from '$lib/features/settings/extraUseCases';
  import SettingsAiCard from '$lib/features/settings/components/SettingsAiCard.svelte';

  let { context }: { context: SettingsWorkbenchContext } = $props();
  let triedAutoConnect = $state(false);

  const connectionHint = $derived.by(() => {
    if (appSettingsState.connectionError) {
      return `${context.t('settings.connect_error')}: ${appSettingsState.connectionError}`;
    }
    if (appSettingsState.modelOptions.length > 0) {
      return context.t('settings.connect_ready', {
        values: { count: String(appSettingsState.modelOptions.length) },
      });
    }
    return context.t('settings.connect_hint');
  });

  const secretBadgeLabel = $derived(
    context.t(appSettingsState.values.hasSecretKey
      ? 'settings.secret_saved'
      : 'settings.secret_missing'),
  );
  const secretPlaceholder = $derived(
    context.t(appSettingsState.values.hasSecretKey
      ? 'settings.secret_placeholder_saved'
      : 'settings.secret_placeholder_empty'),
  );

  const connect = async () => {
    await connectSettingsAiFlow({
      form: context.form,
      hasAiCapability: true,
      t: context.t,
    });
  };

  const saveModel = async () => {
    await saveSelectedModelFlow({
      form: context.form,
      hasAiCapability: true,
      t: context.t,
    });
  };

  const clearSecret = async () => {
    await clearSecretKeyFlow({
      form: context.form,
      hasAiCapability: true,
      t: context.t,
    });
  };

  onMount(() => {
    if (
      triedAutoConnect
      || appSettingsState.loading
      || !appSettingsState.loaded
      || !appSettingsState.values.hasSecretKey
      || !appSettingsState.values.apiBaseUrl.trim()
    ) {
      return;
    }
    triedAutoConnect = true;
    void autoConnectSettingsFlow({
      values: appSettingsState.values,
      hasAiCapability: true,
      setModel: (model) => {
        context.form.model = model;
      },
    });
  });
</script>

<SettingsAiCard
  title={context.t('settings.ai_title')}
  description={context.t('settings.ai_description')}
  badgeLabel={secretBadgeLabel}
  hasSecretKey={appSettingsState.values.hasSecretKey}
  baseUrlLabel={context.t('settings.base_url')}
  secretKeyLabel={context.t('settings.secret_key')}
  modelLabel={context.t('settings.model')}
  temperatureLabel={context.t('settings.temperature')}
  temperatureHint={context.t('settings.temperature_hint')}
  connectHint={connectionHint}
  connectHintError={appSettingsState.connectionError !== ''}
  connectLabel={context.t('settings.connect')}
  connectingLabel={context.t('settings.connecting')}
  secretClearLabel={context.t('settings.secret_clear')}
  modelPlaceholder={context.t('settings.model_placeholder')}
  apiBaseUrl={context.form.apiBaseUrl}
  secretKey={context.form.secretKey}
  model={context.form.model}
  temperature={context.form.temperature}
  modelOptions={appSettingsState.modelOptions}
  connecting={appSettingsState.connecting}
  {secretPlaceholder}
  onApiBaseUrlInput={(value) => { context.form.apiBaseUrl = value; }}
  onSecretKeyInput={(value) => { context.form.secretKey = value; }}
  onModelInput={(value) => { context.form.model = value; }}
  onModelChange={saveModel}
  onTemperatureInput={(value) => { context.form.temperature = value; }}
  onConnect={connect}
  onClearSecretKey={clearSecret}
/>
