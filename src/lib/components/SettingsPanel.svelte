<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { open } from '@tauri-apps/plugin-dialog';
  import { invoke } from '@tauri-apps/api/core';
  import { HAS_AI_FEATURE } from '$lib/config/build';
  import {
    appSettingsState,
    clearCustomCoverImage,
    connectAiProvider,
    loadAppSettings,
    saveAppSettings,
    setCustomCoverImage,
  } from '$lib/stores/appSettings.svelte';
  import { showToast } from '$lib/stores/toast.svelte';
  import { writeErrorLog } from '$lib/utils/errorLog';

  let apiBaseUrl = $state('');
  let model = $state('gpt-4o-mini');
  let temperature = $state(1);
  let scriptTemplate = $state('');
  let secretKey = $state('');
  let isHydrated = false;
  let triedAutoConnect = false;
  let settingsDescription = $derived($_(HAS_AI_FEATURE ? 'settings.description_extra' : 'settings.description_base'));

  function getNormalizedTemperature() {
    const value = Number(temperature);
    if (!Number.isFinite(value)) {
      return 1;
    }

    return Math.min(2, Math.max(0, value));
  }

  async function handlePickCover() {
    const selected = await open({
      multiple: false,
      filters: [{ name: 'JPEG', extensions: ['jpg', 'jpeg'] }],
    });

    if (!selected || typeof selected !== 'string') return;

    try {
      await setCustomCoverImage(selected);
      showToast($_('settings.cover_saved'), 'success');
    } catch (error) {
      console.error('Failed to set cover image', error);
      void writeErrorLog({ source: 'settings.cover.pick', error });
      showToast($_('settings.cover_save_failed'), 'error');
    }
  }

  async function handleClearCover() {
    try {
      await clearCustomCoverImage();
      showToast($_('settings.cover_cleared'), 'success');
    } catch (error) {
      console.error('Failed to clear cover image', error);
      void writeErrorLog({ source: 'settings.cover.clear', error });
      showToast($_('settings.cover_save_failed'), 'error');
    }
  }

  async function handleSaveSettings() {
    try {
      await saveAppSettings({
        apiBaseUrl,
        model,
        temperature: getNormalizedTemperature(),
        scriptTemplate,
        secretKey,
      });
      secretKey = '';
      showToast($_('settings.save_success'), 'success');
    } catch (error) {
      console.error('Failed to save settings', error);
      void writeErrorLog({ source: 'settings.save', error });
      showToast($_('settings.save_failed'), 'error');
    }
  }

  async function handleConnect() {
    if (!HAS_AI_FEATURE) return;

    try {
      const result = await connectAiProvider({
        apiBaseUrl,
        secretKey,
        temperature: getNormalizedTemperature(),
        scriptTemplate,
        preferredModel: model,
      });
      model = result.selectedModel;
      secretKey = '';
      showToast($_('settings.connect_success'), 'success');
    } catch (error) {
      console.error('Failed to connect AI provider', error);
      void writeErrorLog({
        source: 'settings.ai.connect',
        error,
        extra: { apiBaseUrl },
      });
      showToast($_('settings.connect_failed'), 'error');
    }
  }

  async function handleModelChange() {
    if (!HAS_AI_FEATURE) return;

    try {
      await saveAppSettings({
        apiBaseUrl,
        model,
        temperature: getNormalizedTemperature(),
        scriptTemplate,
      });
      showToast($_('settings.model_saved'), 'success');
    } catch (error) {
      console.error('Failed to save selected model', error);
      void writeErrorLog({
        source: 'settings.ai.model.change',
        error,
        extra: { apiBaseUrl, model },
      });
      showToast($_('settings.save_failed'), 'error');
    }
  }

  async function handleClearSecretKey() {
    if (!HAS_AI_FEATURE) return;

    try {
      await saveAppSettings({
        apiBaseUrl,
        model,
        temperature: getNormalizedTemperature(),
        scriptTemplate,
        clearSecretKey: true,
      });
      secretKey = '';
      showToast($_('settings.secret_cleared'), 'success');
    } catch (error) {
      console.error('Failed to clear secret key', error);
      void writeErrorLog({ source: 'settings.secret.clear', error });
      showToast($_('settings.save_failed'), 'error');
    }
  }

  async function handleOpenErrorLog() {
    const path = appSettingsState.values.errorLogPath;
    if (!path) return;

    try {
      await invoke('open_in_system_editor', { path });
    } catch (error) {
      console.error('Failed to open error log', error);
      void writeErrorLog({
        source: 'settings.error-log.open',
        error,
        extra: { path: appSettingsState.values.errorLogPath },
      });
      showToast($_('settings.error_log_open_failed'), 'error');
    }
  }

  $effect(() => {
    void loadAppSettings();
  });

  $effect(() => {
    if (appSettingsState.loading || !appSettingsState.loaded) return;

    apiBaseUrl = appSettingsState.values.apiBaseUrl;
    model = appSettingsState.values.model;
    temperature = appSettingsState.values.temperature;
    scriptTemplate = appSettingsState.values.scriptTemplate;
    if (!isHydrated) {
      secretKey = '';
      isHydrated = true;
    }

    if (HAS_AI_FEATURE && !triedAutoConnect && appSettingsState.values.hasSecretKey && appSettingsState.values.apiBaseUrl) {
      triedAutoConnect = true;
      void connectAiProvider({
        apiBaseUrl: appSettingsState.values.apiBaseUrl,
        scriptTemplate: appSettingsState.values.scriptTemplate,
        preferredModel: appSettingsState.values.model,
        persist: false,
      }).then((result) => {
        model = result.selectedModel;
      }).catch(() => {
        // Keep the cached model even if the list refresh fails.
      });
    }
  });
</script>

<section class="settings-page">
  <div class="settings-header">
    <div>
      <h2>{$_('settings.title')}</h2>
      <p>{settingsDescription}</p>
    </div>
    <button class="btn-primary" type="button" onclick={handleSaveSettings} disabled={appSettingsState.saving}>
      {appSettingsState.saving ? $_('settings.saving') : $_('settings.save')}
    </button>
  </div>

  <div class="settings-grid" class:single-column={!HAS_AI_FEATURE}>
    <section class="settings-card cover-card">
      <div class="card-header">
        <div>
          <h3>{$_('settings.cover_title')}</h3>
          <p>{$_('settings.cover_description')}</p>
        </div>
      </div>

      <div class="cover-preview-wrap">
        <img src={appSettingsState.coverImageSrc} alt={$_('settings.cover_title')} class="cover-preview" />
      </div>

      <div class="card-actions">
        <button class="btn-secondary" type="button" onclick={handlePickCover}>{$_('settings.cover_pick')}</button>
        <button class="btn-secondary" type="button" onclick={handleClearCover}>{$_('settings.cover_reset')}</button>
      </div>
    </section>

    {#if HAS_AI_FEATURE}
      <section class="settings-card">
        <div class="card-header">
          <div>
            <h3>{$_('settings.ai_title')}</h3>
            <p>{$_('settings.ai_description')}</p>
          </div>
        </div>

        <label class="field">
          <span>{$_('settings.base_url')}</span>
          <input
            type="text"
            bind:value={apiBaseUrl}
            placeholder="https://api.openai.com/v1"
          />
        </label>

        <label class="field">
          <span>{$_('settings.model')}</span>
          <select bind:value={model} onchange={handleModelChange} disabled={appSettingsState.connecting || appSettingsState.modelOptions.length === 0}>
            {#if appSettingsState.modelOptions.length === 0}
              <option value="">{$_('settings.model_placeholder')}</option>
            {/if}
            {#each appSettingsState.modelOptions as item}
              <option value={item}>{item}</option>
            {/each}
          </select>
        </label>

        <label class="field">
          <span>{$_('settings.temperature')}</span>
          <input
            type="number"
            min="0"
            max="2"
            step="0.1"
            bind:value={temperature}
          />
          <small class="field-hint">{$_('settings.temperature_hint')}</small>
        </label>

        <label class="field">
          <span>{$_('settings.secret_key')}</span>
          <input
            type="password"
            bind:value={secretKey}
            placeholder={appSettingsState.values.hasSecretKey ? $_('settings.secret_placeholder_saved') : $_('settings.secret_placeholder_empty')}
          />
        </label>

        <div class="secret-row">
          <span class:ready={appSettingsState.values.hasSecretKey}>
            {appSettingsState.values.hasSecretKey ? $_('settings.secret_saved') : $_('settings.secret_missing')}
          </span>
          <div class="ai-action-row">
            <button class="btn-secondary" type="button" onclick={handleConnect} disabled={appSettingsState.connecting}>
              {appSettingsState.connecting ? $_('settings.connecting') : $_('settings.connect')}
            </button>
            <button class="btn-secondary" type="button" onclick={handleClearSecretKey}>
              {$_('settings.secret_clear')}
            </button>
          </div>
        </div>

        <div class="connect-hint" class:error={appSettingsState.connectionError !== ''}>
          {#if appSettingsState.connectionError}
            {$_('settings.connect_error')}: {appSettingsState.connectionError}
          {:else if appSettingsState.modelOptions.length > 0}
            {$_('settings.connect_ready', { values: { count: String(appSettingsState.modelOptions.length) } })}
          {:else}
            {$_('settings.connect_hint')}
          {/if}
        </div>
      </section>
    {/if}
  </div>

  <section class="settings-card template-card">
    <div class="card-header">
      <div>
        <h3>{$_('settings.script_template_title')}</h3>
        <p>{$_('settings.script_template_description')}</p>
      </div>
    </div>

    <label class="field">
      <span>{$_('settings.script_template')}</span>
      <textarea rows="8" bind:value={scriptTemplate}></textarea>
    </label>
  </section>

  <section class="settings-card">
    <div class="card-header">
      <div>
        <h3>{$_('settings.error_log_title')}</h3>
        <p>{$_('settings.error_log_description')}</p>
      </div>
      <button class="btn-secondary" type="button" onclick={handleOpenErrorLog}>
        {$_('settings.error_log_open')}
      </button>
    </div>

    <div class="log-path">{appSettingsState.values.errorLogPath || '-'}</div>
  </section>
</section>

<style>
  .settings-page {
    height: 100%;
    overflow: auto;
    padding: 20px;
    background:
      radial-gradient(circle at top right, rgba(34, 197, 94, 0.12), transparent 24%),
      radial-gradient(circle at left top, rgba(59, 130, 246, 0.12), transparent 32%),
      var(--bg-base);
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .settings-header,
  .card-header,
  .card-actions,
  .secret-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .settings-header h2,
  .card-header h3 {
    margin: 0;
    color: var(--text-primary);
  }

  .settings-header p,
  .card-header p,
  .secret-row span {
    margin: 4px 0 0;
    color: var(--text-secondary);
    font-size: 0.9rem;
  }

  .secret-row span.ready {
    color: #16a34a;
  }

  .settings-grid {
    display: grid;
    grid-template-columns: minmax(320px, 420px) minmax(360px, 1fr);
    gap: 18px;
  }

  .settings-grid.single-column {
    grid-template-columns: minmax(320px, 420px);
  }

  .settings-card {
    background: color-mix(in srgb, var(--bg-surface) 88%, transparent);
    border: 1px solid var(--border-color);
    border-radius: 16px;
    padding: 18px;
    box-shadow: 0 14px 36px rgba(15, 23, 42, 0.12);
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .cover-card {
    min-height: 100%;
  }

  .cover-preview-wrap {
    flex: 1;
    min-height: 300px;
    border-radius: 14px;
    border: 1px dashed var(--border-color);
    background:
      linear-gradient(135deg, rgba(15, 23, 42, 0.08), rgba(15, 23, 42, 0.02)),
      var(--bg-surface-active);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 18px;
  }

  .cover-preview {
    width: min(100%, 280px);
    aspect-ratio: 0.69;
    object-fit: cover;
    border-radius: 12px;
    box-shadow: 0 16px 32px rgba(15, 23, 42, 0.24);
    background: #111827;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .field span {
    color: var(--text-secondary);
    font-weight: 600;
    font-size: 0.85rem;
  }

  .field-hint {
    color: var(--text-secondary);
    font-size: 0.82rem;
    line-height: 1.4;
  }

  input,
  textarea,
  select {
    width: 100%;
    border: 1px solid var(--border-color);
    border-radius: 10px;
    background: var(--bg-base);
    color: var(--text-primary);
    padding: 0.7rem 0.85rem;
    font-size: 0.95rem;
  }

  textarea {
    min-height: 220px;
    resize: vertical;
    font-family: Consolas, 'Courier New', monospace;
  }

  input:focus,
  textarea:focus,
  select:focus {
    outline: none;
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 1px var(--accent-primary);
  }

  .card-actions,
  .secret-row {
    align-items: center;
  }

  .ai-action-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .connect-hint {
    color: var(--text-secondary);
    font-size: 0.86rem;
    line-height: 1.45;
  }

  .connect-hint.error {
    color: #dc2626;
  }

  .log-path {
    font-family: Consolas, 'Courier New', monospace;
    font-size: 0.84rem;
    line-height: 1.5;
    padding: 0.8rem 0.9rem;
    border-radius: 10px;
    background: var(--bg-base);
    border: 1px solid var(--border-color);
    color: var(--text-secondary);
    word-break: break-all;
  }

  button {
    border: none;
    border-radius: 10px;
    padding: 0.65rem 0.95rem;
    font-size: 0.9rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  button:disabled {
    opacity: 0.65;
    cursor: not-allowed;
  }

  .btn-primary {
    background: linear-gradient(135deg, #0f766e, #14b8a6);
    color: white;
    box-shadow: 0 12px 28px rgba(20, 184, 166, 0.22);
  }

  .btn-primary:hover:not(:disabled) {
    filter: brightness(1.04);
  }

  .btn-secondary {
    background: var(--bg-surface-active);
    color: var(--text-primary);
    border: 1px solid var(--border-color);
  }

  .btn-secondary:hover:not(:disabled) {
    background: var(--bg-surface-hover);
  }

  @media (max-width: 960px) {
    .settings-grid {
      grid-template-columns: 1fr;
    }

    .settings-header {
      flex-direction: column;
      align-items: stretch;
    }

    .settings-header button {
      width: 100%;
    }
  }
</style>
