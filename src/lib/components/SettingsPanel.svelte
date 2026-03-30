<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { HAS_AI_FEATURE } from '$lib/config/build';
  import { tauriBridge } from '$lib/infrastructure/tauri';
  import { openInSystemEditor } from '$lib/infrastructure/tauri/commands';
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
  let useExternalScriptEditor = $state(false);
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
    const selected = await tauriBridge.open({
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
        useExternalScriptEditor,
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
      void writeErrorLog({ source: 'settings.ai.connect', error, extra: { apiBaseUrl } });
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
        useExternalScriptEditor,
      });
      showToast($_('settings.model_saved'), 'success');
    } catch (error) {
      console.error('Failed to save selected model', error);
      void writeErrorLog({ source: 'settings.ai.model.change', error, extra: { apiBaseUrl, model } });
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
        useExternalScriptEditor,
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
      await openInSystemEditor(path);
    } catch (error) {
      console.error('Failed to open error log', error);
      void writeErrorLog({ source: 'settings.error-log.open', error, extra: { path: appSettingsState.values.errorLogPath } });
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
    useExternalScriptEditor = appSettingsState.values.useExternalScriptEditor;
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
      }).catch(() => {});
    }
  });
</script>

<section class="sp">
  <!-- Header -->
  <header class="sp-header">
    <div>
      <h2>{$_('settings.title')}</h2>
      <p class="sp-subtitle">{settingsDescription}</p>
    </div>
    <button class="sp-save" type="button" onclick={handleSaveSettings} disabled={appSettingsState.saving}>
      {appSettingsState.saving ? $_('settings.saving') : $_('settings.save')}
    </button>
  </header>

  <div class="sp-body">
    <!-- Row 1: Cover + Error Log side by side -->
    <div class="sp-row-top">
      <!-- Cover: horizontal card -->
      <div class="sp-card sp-cover">
        <img src={appSettingsState.coverImageSrc} alt={$_('settings.cover_title')} class="sp-cover-img" />
        <div class="sp-cover-body">
          <div class="sp-card-head">
            <h3>{$_('settings.cover_title')}</h3>
            <p>{$_('settings.cover_description')}</p>
          </div>
          <div class="sp-btns">
            <button class="sp-btn" type="button" onclick={handlePickCover}>{$_('settings.cover_pick')}</button>
            <button class="sp-btn sp-btn-ghost" type="button" onclick={handleClearCover}>{$_('settings.cover_reset')}</button>
          </div>
        </div>
      </div>

      <!-- Error Log: compact -->
      <div class="sp-card sp-log">
        <div class="sp-card-head">
          <h3>{$_('settings.error_log_title')}</h3>
          <p>{$_('settings.error_log_description')}</p>
        </div>
        <code class="sp-log-path">{appSettingsState.values.errorLogPath || '-'}</code>
        <button class="sp-btn" type="button" onclick={handleOpenErrorLog}>{$_('settings.error_log_open')}</button>
      </div>
    </div>

    <!-- Row 2: Script Template -->
    <div class="sp-card sp-tpl">
      <div class="sp-tpl-head">
        <div class="sp-card-head">
          <h3>{$_('settings.script_template_title')}</h3>
          <p>{$_('settings.script_template_description')}</p>
        </div>
        <label class="sp-check">
          <input type="checkbox" bind:checked={useExternalScriptEditor} />
          <span>{$_('settings.use_external_script_editor')}</span>
        </label>
      </div>
      <small class="sp-hint">{$_('settings.use_external_script_editor_hint')}</small>
      <textarea class="sp-textarea" rows="5" bind:value={scriptTemplate}></textarea>
    </div>

    <!-- Row 3: AI (conditional) -->
    {#if HAS_AI_FEATURE}
      <div class="sp-card sp-ai">
        <div class="sp-ai-head">
          <div class="sp-card-head">
            <h3>{$_('settings.ai_title')}</h3>
            <p>{$_('settings.ai_description')}</p>
          </div>
          <span class="sp-badge" class:ok={appSettingsState.values.hasSecretKey}>
            {appSettingsState.values.hasSecretKey ? $_('settings.secret_saved') : $_('settings.secret_missing')}
          </span>
        </div>

        <div class="sp-ai-grid">
          <label class="sp-field">
            <span>{$_('settings.base_url')}</span>
            <input type="text" bind:value={apiBaseUrl} placeholder="https://api.openai.com/v1" />
          </label>

          <label class="sp-field">
            <span>{$_('settings.secret_key')}</span>
            <input
              type="password"
              bind:value={secretKey}
              placeholder={appSettingsState.values.hasSecretKey ? $_('settings.secret_placeholder_saved') : $_('settings.secret_placeholder_empty')}
            />
          </label>

          <label class="sp-field">
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

          <label class="sp-field">
            <span>{$_('settings.temperature')}</span>
            <input type="number" min="0" max="2" step="0.1" bind:value={temperature} />
            <small class="sp-hint">{$_('settings.temperature_hint')}</small>
          </label>
        </div>

        <div class="sp-ai-foot">
          <p class="sp-ai-hint" class:err={appSettingsState.connectionError !== ''}>
            {#if appSettingsState.connectionError}
              {$_('settings.connect_error')}: {appSettingsState.connectionError}
            {:else if appSettingsState.modelOptions.length > 0}
              {$_('settings.connect_ready', { values: { count: String(appSettingsState.modelOptions.length) } })}
            {:else}
              {$_('settings.connect_hint')}
            {/if}
          </p>
          <div class="sp-btns">
            <button class="sp-btn" type="button" onclick={handleConnect} disabled={appSettingsState.connecting}>
              {appSettingsState.connecting ? $_('settings.connecting') : $_('settings.connect')}
            </button>
            <button class="sp-btn sp-btn-ghost" type="button" onclick={handleClearSecretKey}>
              {$_('settings.secret_clear')}
            </button>
          </div>
        </div>
      </div>
    {/if}
  </div>
</section>

<style>
  /* ─── page shell ─── */
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

  /* ─── header ─── */
  .sp-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
    flex-shrink: 0;
  }
  .sp-header h2 {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 700;
    color: var(--text-primary);
  }
  .sp-subtitle {
    margin: 1px 0 0;
    font-size: 0.78rem;
    color: var(--text-secondary);
  }
  .sp-save {
    flex-shrink: 0;
    padding: 7px 16px;
    border-radius: 8px;
    font-size: 0.82rem;
    font-weight: 700;
    color: #fff;
    background: linear-gradient(135deg, #0d9488, #14b8a6);
    box-shadow: 0 2px 8px rgba(20, 184, 166, 0.25);
    border: none;
    cursor: pointer;
    transition: filter 0.15s, box-shadow 0.15s;
  }
  .sp-save:hover:not(:disabled) { filter: brightness(1.08); box-shadow: 0 4px 14px rgba(20, 184, 166, 0.35); }
  .sp-save:disabled { opacity: 0.55; cursor: not-allowed; }

  /* ─── scrollable body ─── */
  .sp-body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  /* ─── card base ─── */
  .sp-card {
    background: color-mix(in srgb, var(--bg-surface) 92%, transparent);
    border: 1px solid var(--border-color);
    border-radius: 10px;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .sp-card-head h3 {
    margin: 0;
    font-size: 0.88rem;
    font-weight: 700;
    color: var(--text-primary);
  }
  .sp-card-head p {
    margin: 2px 0 0;
    font-size: 0.76rem;
    color: var(--text-secondary);
    line-height: 1.4;
  }

  /* ─── top row: cover + log ─── */
  .sp-row-top {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    align-items: start;
  }

  /* cover card: horizontal */
  .sp-cover {
    flex-direction: row;
    align-items: stretch;
    gap: 12px;
  }
  .sp-cover-img {
    width: 90px;
    aspect-ratio: 0.69;
    object-fit: cover;
    border-radius: 6px;
    background: #111827;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
    flex-shrink: 0;
  }
  .sp-cover-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 6px;
  }

  /* log card */
  .sp-log {
    justify-content: space-between;
  }
  .sp-log-path {
    font-family: 'Cascadia Code', Consolas, 'Courier New', monospace;
    font-size: 0.72rem;
    line-height: 1.45;
    padding: 6px 8px;
    border-radius: 6px;
    background: var(--bg-base);
    border: 1px solid var(--border-color);
    color: var(--text-secondary);
    word-break: break-all;
    display: block;
  }

  /* ─── template card ─── */
  .sp-tpl-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }
  .sp-textarea {
    width: 100%;
    min-height: 90px;
    max-height: 200px;
    resize: vertical;
    font-family: 'Cascadia Code', Consolas, 'Courier New', monospace;
    font-size: 0.82rem;
    line-height: 1.5;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    background: var(--bg-base);
    color: var(--text-primary);
    padding: 8px 10px;
    transition: border-color 0.15s;
  }
  .sp-textarea:focus {
    outline: none;
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent-primary) 16%, transparent);
  }

  /* ─── AI card ─── */
  .sp-ai-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
  }
  .sp-badge {
    flex-shrink: 0;
    font-size: 0.7rem;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 9px;
    background: color-mix(in srgb, var(--text-disabled) 14%, transparent);
    color: var(--text-disabled);
    white-space: nowrap;
    margin-top: 1px;
  }
  .sp-badge.ok {
    background: rgba(22, 163, 74, 0.12);
    color: #22c55e;
  }
  .sp-ai-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px 12px;
  }
  .sp-ai-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .sp-ai-hint {
    margin: 0;
    font-size: 0.76rem;
    color: var(--text-secondary);
    line-height: 1.35;
    min-width: 0;
  }
  .sp-ai-hint.err { color: #ef4444; }

  /* ─── shared field ─── */
  .sp-field {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .sp-field > span {
    font-size: 0.74rem;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  input, select {
    width: 100%;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    background: var(--bg-base);
    color: var(--text-primary);
    padding: 6px 9px;
    font-size: 0.84rem;
    transition: border-color 0.15s;
  }
  input:focus, select:focus {
    outline: none;
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent-primary) 16%, transparent);
  }

  /* ─── checkbox ─── */
  .sp-check {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    user-select: none;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .sp-check input { width: auto; accent-color: var(--accent-primary); }
  .sp-check span { font-size: 0.8rem; font-weight: 500; color: var(--text-primary); }

  .sp-hint {
    font-size: 0.72rem;
    color: var(--text-disabled);
    line-height: 1.35;
  }

  /* ─── buttons ─── */
  .sp-btns {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .sp-btn {
    border: 1px solid var(--border-color);
    border-radius: 6px;
    padding: 5px 10px;
    font-size: 0.78rem;
    font-weight: 600;
    cursor: pointer;
    background: var(--bg-surface-active);
    color: var(--text-primary);
    transition: background 0.12s, border-color 0.12s;
    white-space: nowrap;
  }
  .sp-btn:hover:not(:disabled) { background: var(--bg-surface-hover); border-color: var(--accent-primary); }
  .sp-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .sp-btn-ghost {
    background: transparent;
    border-color: transparent;
    color: var(--text-secondary);
  }
  .sp-btn-ghost:hover:not(:disabled) {
    color: var(--text-primary);
    background: var(--bg-surface-active);
    border-color: var(--border-color);
  }

  /* ─── responsive ─── */
  @media (max-width: 780px) {
    .sp-row-top { grid-template-columns: 1fr; }
    .sp-ai-grid { grid-template-columns: 1fr; }
    .sp-header { flex-direction: column; align-items: stretch; }
    .sp-save { width: 100%; }
    .sp-tpl-head { flex-direction: column; }
    .sp-ai-foot { flex-direction: column; align-items: stretch; }
  }
</style>
