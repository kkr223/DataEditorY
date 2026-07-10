<script lang="ts">
  import { onMount } from 'svelte';
  import type { SettingsWorkbenchContext } from '$lib/modules/settings/workbench/context';
  import { appSettingsState } from '$lib/stores/appSettings.svelte';
  import {
    autoConnectSettingsFlow,
    clearSecretKeyFlow,
    connectSettingsAiFlow,
  } from '$lib/features/settings/extraUseCases';
  import SettingsAiCard from '$lib/features/settings/components/SettingsAiCard.svelte';
  import {
    loadAiPromptFiles,
    loadAiSkillFiles,
    resolveAiPromptPath,
    resolveAiSkillPath,
    buildSkillTemplate,
  } from '$lib/features/ai/service';
  import { openTextFile } from '$lib/stores/textEditor.svelte';
  import { writeTextFile } from '$lib/infrastructure/tauri/commands';
  import { invokeCommand } from '$lib/infrastructure/tauri';
  import { showToast } from '$lib/stores/toast.svelte';

  let { context }: { context: SettingsWorkbenchContext } = $props();
  let triedAutoConnect = $state(false);
  let promptFiles = $state<string[]>([]);
  let skillFiles = $state<string[]>([]);
  let newSkillName = $state('');
  let isAddingSkill = $state(false);

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

  const clearSecret = async () => {
    await clearSecretKeyFlow({
      form: context.form,
      hasAiCapability: true,
      t: context.t,
    });
  };

  async function refreshLists() {
    try {
      [promptFiles, skillFiles] = await Promise.all([
        loadAiPromptFiles(),
        loadAiSkillFiles(),
      ]);
    } catch (error) {
      console.error('Failed to load AI prompt/skill lists:', error);
    }
  }

  async function handleEditPrompt(file: string) {
    try {
      const absolutePath = await resolveAiPromptPath(file);
      await openTextFile(absolutePath);
    } catch (error) {
      console.error('Failed to open prompt file:', error);
      showToast(context.t('settings.prompt_open_failed'), 'error');
    }
  }

  async function handleEditSkill(file: string) {
    try {
      const absolutePath = await resolveAiSkillPath(file);
      await openTextFile(absolutePath);
    } catch (error) {
      console.error('Failed to open skill file:', error);
      showToast(context.t('settings.prompt_open_failed'), 'error');
    }
  }

  async function handleAddSkill() {
    const name = newSkillName.trim();
    if (!name) {
      showToast(context.t('settings.skill_name_empty'), 'error');
      return;
    }
    const safeName = name.replace(/[^A-Za-z0-9_-]/g, '_');
    const file = `${safeName}.md`;
    if (skillFiles.includes(file)) {
      showToast(context.t('settings.skill_add_failed'), 'error');
      return;
    }
    isAddingSkill = true;
    try {
      const absolutePath = await resolveAiSkillPath(file);
      await writeTextFile(absolutePath, buildSkillTemplate(safeName));
      // ponytail: write manifest directly; resource dir writable in dev, may be read-only in installed builds
      const manifestPath = await invokeCommand<string>('resolve_resource_file', { relativePath: 'ai-skills/manifest.json' });
      const nextManifest = [...skillFiles, file];
      await writeTextFile(manifestPath, JSON.stringify(nextManifest, null, 2) + '\n');
      await refreshLists();
      newSkillName = '';
      showToast(context.t('settings.skill_added', { values: { name: safeName } }), 'success');
      await openTextFile(absolutePath);
    } catch (error) {
      console.error('Failed to create skill:', error);
      showToast(context.t('settings.skill_add_failed'), 'error');
    } finally {
      isAddingSkill = false;
    }
  }

  onMount(() => {
    void refreshLists();
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
  temperatureLabel={context.t('settings.temperature')}
  temperatureHint={context.t('settings.temperature_hint')}
  connectHint={connectionHint}
  connectHintError={appSettingsState.connectionError !== ''}
  connectLabel={context.t('settings.connect')}
  connectingLabel={context.t('settings.connecting')}
  secretClearLabel={context.t('settings.secret_clear')}
  apiBaseUrl={context.form.apiBaseUrl}
  secretKey={context.form.secretKey}
  temperature={context.form.temperature}
  connecting={appSettingsState.connecting}
  {secretPlaceholder}
  onApiBaseUrlInput={(value) => { context.form.apiBaseUrl = value; }}
  onSecretKeyInput={(value) => { context.form.secretKey = value; }}
  onTemperatureInput={(value) => { context.form.temperature = value; }}
  onConnect={connect}
  onClearSecretKey={clearSecret}
/>

<section class="ai-resource-card">
  <header>
    <h3>{context.t('settings.prompts_title')}</h3>
    <p>{context.t('settings.prompts_description')}</p>
  </header>
  <ul class="ai-resource-list">
    {#each promptFiles as file (file)}
      <li>
        <span class="ai-resource-name">{file}</span>
        <button type="button" class="ai-resource-edit" onclick={() => handleEditPrompt(file)}>
          {context.t('settings.prompt_edit')}
        </button>
      </li>
    {/each}
  </ul>
</section>

<section class="ai-resource-card">
  <header>
    <h3>{context.t('settings.skills_title')}</h3>
    <p>{context.t('settings.skills_description')}</p>
  </header>
  <ul class="ai-resource-list">
    {#each skillFiles as file (file)}
      <li>
        <span class="ai-resource-name">{file}</span>
        <button type="button" class="ai-resource-edit" onclick={() => handleEditSkill(file)}>
          {context.t('settings.prompt_edit')}
        </button>
      </li>
    {/each}
  </ul>
  <div class="ai-skill-add">
    <input
      type="text"
      placeholder={context.t('settings.skill_add_placeholder')}
      value={newSkillName}
      oninput={(event) => { newSkillName = (event.currentTarget as HTMLInputElement).value; }}
      onkeydown={(event) => { if (event.key === 'Enter') void handleAddSkill(); }}
    />
    <button type="button" onclick={() => void handleAddSkill()} disabled={isAddingSkill}>
      {context.t('settings.skill_add_confirm')}
    </button>
  </div>
</section>

<style>
  .ai-resource-card {
    margin-top: 10px;
    padding: 14px 16px;
    border: 1px solid var(--border-color);
    border-radius: var(--control-radius-lg, 10px);
    background: var(--bg-surface);
  }

  .ai-resource-card header {
    margin-bottom: 8px;
  }

  .ai-resource-card h3 {
    margin: 0 0 4px;
    font-size: 1.02rem;
    color: var(--text-primary);
  }

  .ai-resource-card p {
    margin: 0;
    font-size: 0.85rem;
    color: var(--text-secondary);
  }

  .ai-resource-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .ai-resource-list li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 10px;
    border-radius: var(--control-radius, 6px);
    background: var(--bg-base);
  }

  .ai-resource-name {
    color: var(--text-primary);
    font-size: 0.9rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ai-resource-edit {
    padding: 3px 12px;
    border: 1px solid var(--border-color);
    border-radius: var(--control-radius, 6px);
    background: var(--bg-surface);
    color: var(--text-secondary);
    cursor: pointer;
    font: inherit;
    flex-shrink: 0;
  }

  .ai-resource-edit:hover {
    background: var(--bg-surface-hover);
    color: var(--text-primary);
  }

  .ai-skill-add {
    display: flex;
    gap: 8px;
    margin-top: 10px;
  }

  .ai-skill-add input {
    flex: 1;
    padding: 5px 10px;
    border: 1px solid var(--border-color);
    border-radius: var(--control-radius, 6px);
    background: var(--bg-base);
    color: var(--text-primary);
    font: inherit;
  }

  .ai-skill-add input:focus {
    outline: none;
    border-color: var(--accent-primary);
  }

  .ai-skill-add button {
    padding: 5px 14px;
    border: 1px solid var(--accent-primary);
    border-radius: var(--control-radius, 6px);
    background: var(--accent-primary);
    color: white;
    cursor: pointer;
    font: inherit;
  }

  .ai-skill-add button:hover:not(:disabled) {
    filter: brightness(1.08);
  }

  .ai-skill-add button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
