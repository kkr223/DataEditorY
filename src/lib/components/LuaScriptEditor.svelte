<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { _ } from 'svelte-i18n';
  import { ask, message } from '@tauri-apps/plugin-dialog';
  import { invoke } from '@tauri-apps/api/core';
  import { activeScriptTab, getActiveScriptTab, reloadActiveScriptTab, saveActiveScriptTab, setScriptTabViewState, updateScriptTabContent } from '$lib/stores/scriptEditor.svelte';
  import { activeTabId, getCardByIdInTab, modifyCardsInTab, tabs } from '$lib/stores/db';
  import { HAS_AI_FEATURE } from '$lib/config/build';
  import { appSettingsState, hasConfiguredSecretKey, loadAppSettings } from '$lib/stores/appSettings.svelte';
  import { showToast } from '$lib/stores/toast.svelte';
  import { syncScriptTabFromSavedContent } from '$lib/stores/scriptEditor.svelte';
  import { updateVisibleCards } from '$lib/stores/editor.svelte';
  import { writeErrorLog } from '$lib/utils/errorLog';
  import type { CardDataEntry } from '$lib/types';
  import type { AgentStage } from '$lib/utils/ai';
  import type { editor as MonacoEditor } from 'monaco-editor';

  type MonacoModule = typeof import('$lib/utils/luaScriptMonaco');
  type MonacoApi = typeof import('monaco-editor');

  let editorHost = $state<HTMLDivElement | null>(null);
  let monacoModule = $state<MonacoModule | null>(null);
  let monacoApi = $state<MonacoApi | null>(null);
  let editorInstance = $state<MonacoEditor.IStandaloneCodeEditor | null>(null);
  let currentBoundTabId = $state<string | null>(null);
  let isApplyingModel = false;
  let cardContext = $state<CardDataEntry | null>(null);
  let isReloading = $state(false);
  let isSaving = $state(false);
  let isGeneratingScript = $state(false);
  let isMonacoReady = $state(false);
  let loadContextToken = 0;
  let lastContextKey = $state('');
  let savedScriptStrings = $state<string[]>(Array.from({ length: 16 }, () => ''));
  let scriptGenerationStage = $state<AgentStage | ''>('');
  let scriptGenerationAbortController = $state<AbortController | null>(null);
  let suggestHintText = $state('');
  let suggestHintTimer: ReturnType<typeof setInterval> | null = null;
  let themeObserver: MutationObserver | null = null;

  let scriptStrings = $derived.by(() => {
    const values = Array.from({ length: 16 }, (_, index) => cardContext?.strings[index] ?? '');
    return values;
  });

  function normalizeCardStrings(strings: string[] | undefined) {
    return Array.from({ length: 16 }, (_, index) => strings?.[index] ?? '');
  }

  function normalizeCardContext(card: CardDataEntry | null | undefined) {
    if (!card) return null;
    return {
      ...card,
      setcode: Array.isArray(card.setcode) ? [...card.setcode] : [],
      strings: normalizeCardStrings(card.strings),
    };
  }

  function getScriptTabTitle() {
    const tab = $activeScriptTab;
    if (!tab) return '';
    return `c${tab.cardCode}.lua`;
  }

  function normalizeGeneratedScript(script: string) {
    const trimmed = script.trim();
    const fenced = trimmed.match(/```(?:lua)?\s*([\s\S]*?)```/i);
    return `${(fenced?.[1] ?? trimmed).trim()}\n`;
  }

  function isAbortError(error: unknown) {
    return error instanceof DOMException && error.name === 'AbortError';
  }

  function getScriptGenerationStageLabel(stage: AgentStage | '') {
    switch (stage) {
      case 'collecting_references':
        return $_('editor.script_stage_collecting_references');
      case 'requesting_model':
        return $_('editor.script_stage_requesting_model');
      case 'running_tools':
        return $_('editor.script_stage_running_tools');
      case 'finalizing_response':
        return $_('editor.script_stage_finalizing_response');
      default:
        return $_('editor.script_generating');
    }
  }

  async function ensureAiReady() {
    if (!HAS_AI_FEATURE) {
      return false;
    }

    await loadAppSettings();
    if (hasConfiguredSecretKey()) {
      return true;
    }

    await message($_('editor.ai_requires_secret_key'), {
      title: $_('editor.ai_requires_secret_key_title'),
      kind: 'warning',
    });
    return false;
  }

  async function loadCardContext() {
    const tab = getActiveScriptTab();
    if (!tab) {
      cardContext = null;
      return;
    }

    const currentToken = ++loadContextToken;
    const sourceTabId = tab.sourceTabId || $tabs.find((item) => item.path === tab.cdbPath)?.id || null;
    if (!sourceTabId) {
      cardContext = null;
      return;
    }

    try {
      const card = await getCardByIdInTab(sourceTabId, tab.cardCode);
      if (currentToken !== loadContextToken) return;
      cardContext = normalizeCardContext(card);
      savedScriptStrings = normalizeCardStrings(card?.strings);
    } catch {
      if (currentToken !== loadContextToken) return;
      cardContext = null;
      savedScriptStrings = Array.from({ length: 16 }, () => '');
    }
  }

  async function handleStringBlur(index: number) {
    const tab = getActiveScriptTab();
    if (!tab || !cardContext) return;

    const nextValue = cardContext.strings[index] ?? '';
    if (nextValue === (savedScriptStrings[index] ?? '')) return;

    const sourceTabId = tab.sourceTabId || $tabs.find((item) => item.path === tab.cdbPath)?.id || null;
    if (!sourceTabId) {
      showToast($_('editor.save_failed'), 'error');
      return;
    }

    const nextCard: CardDataEntry = {
      ...cardContext,
      strings: normalizeCardStrings(cardContext.strings),
      setcode: Array.isArray(cardContext.setcode) ? [...cardContext.setcode] : [],
    };

    const ok = await modifyCardsInTab(sourceTabId, [nextCard]);
    if (!ok) {
      showToast($_('editor.save_failed'), 'error');
      return;
    }

    if ($activeTabId === sourceTabId) {
      updateVisibleCards([nextCard]);
    }

    savedScriptStrings = normalizeCardStrings(nextCard.strings);
  }

  function handleStringInput(index: number, value: string) {
    if (!cardContext) return;
    const nextStrings = normalizeCardStrings(cardContext.strings);
    nextStrings[index] = value;
    cardContext = {
      ...cardContext,
      strings: nextStrings,
    };
  }

  async function syncEditorWithActiveTab() {
    if (!editorInstance || !monacoModule || !monacoApi) return;

    const tab = getActiveScriptTab();
    if (!tab) {
      currentBoundTabId = null;
      editorInstance.setModel(null);
      return;
    }

    if (currentBoundTabId && currentBoundTabId !== tab.id) {
      setScriptTabViewState(currentBoundTabId, editorInstance.saveViewState());
    }

    const uri = monacoModule.createScriptModelUri(tab.id);
    let model = monacoApi.editor.getModel(uri);
    const currentModel = editorInstance.getModel();
    const isSwitchingTab =
      currentBoundTabId !== tab.id || currentModel?.uri.toString() !== uri.toString();

    if (!model) {
      model = monacoApi.editor.createModel(tab.content, 'lua', uri);
    } else if (model.getValue() !== tab.content) {
      isApplyingModel = true;
      model.setValue(tab.content);
      isApplyingModel = false;
    }

    monacoModule.setModelContext(model, {
      cardCode: tab.cardCode,
      cardName: tab.cardName,
      strings: scriptStrings,
      card: cardContext,
    });
    monacoModule.validateLuaModel(model);

    if (isSwitchingTab) {
      editorInstance.setModel(model);
      if (tab.viewState) {
        editorInstance.restoreViewState(tab.viewState as MonacoEditor.ICodeEditorViewState);
      } else {
        editorInstance.setScrollTop(0);
        editorInstance.setPosition({ lineNumber: 1, column: 1 });
      }
      editorInstance.focus();
    } else if (currentModel?.uri.toString() !== model.uri.toString()) {
      editorInstance.setModel(model);
    }

    currentBoundTabId = tab.id;
  }

  function clearSuggestHint() {
    suggestHintText = '';
    if (suggestHintTimer) {
      clearInterval(suggestHintTimer);
      suggestHintTimer = null;
    }
  }

  function extractFocusedSuggestLabel() {
    if (!editorHost) return null;

    const focusedRow = editorHost.querySelector('.suggest-widget .monaco-list-row.focused');
    if (!(focusedRow instanceof HTMLElement)) return null;

    const labelNode = focusedRow.querySelector('.label-name');
    if (labelNode instanceof HTMLElement) {
      return labelNode.textContent?.trim() || null;
    }

    const iconLabel = focusedRow.querySelector('.monaco-icon-label');
    if (iconLabel instanceof HTMLElement) {
      return iconLabel.textContent?.trim() || null;
    }

    return focusedRow.getAttribute('aria-label')?.split(',')[0]?.trim() || null;
  }

  function syncSuggestHint() {
    if (!monacoModule || !editorHost) return;

    const suggestWidget = editorHost.querySelector('.suggest-widget');
    const isSuggestVisible = suggestWidget instanceof HTMLElement
      && suggestWidget.offsetParent !== null
      && suggestWidget.querySelector('.monaco-list-row.focused');

    if (!isSuggestVisible) {
      clearSuggestHint();
      return;
    }

    const label = extractFocusedSuggestLabel();
    const description = label ? monacoModule.lookupCompletionDescription(label) : null;
    suggestHintText = description ?? '';
  }

  function ensureSuggestHintPolling() {
    if (suggestHintTimer) return;
    suggestHintTimer = setInterval(() => {
      syncSuggestHint();
      if (!suggestHintText) {
        clearSuggestHint();
      }
    }, 120);
  }

  function refreshSuggestHint() {
    syncSuggestHint();
    if (suggestHintText) {
      ensureSuggestHintPolling();
    } else if (suggestHintTimer) {
      clearSuggestHint();
    }
  }

  async function handleSave() {
    const tab = getActiveScriptTab();
    if (!tab || isSaving) return;

    try {
      isSaving = true;
      const ok = await saveActiveScriptTab();
      showToast($_(ok ? 'editor.script_save_success' : 'editor.script_save_failed'), ok ? 'success' : 'error');
    } catch (error) {
      console.error('Failed to save script', error);
      void writeErrorLog({
        source: 'script.save',
        error,
        extra: {
          path: tab.scriptPath,
          cardCode: tab.cardCode,
        },
      });
      showToast($_('editor.script_save_failed'), 'error');
    } finally {
      isSaving = false;
    }
  }

  async function handleGenerateScript() {
    const tab = getActiveScriptTab();
    if (!tab || isGeneratingScript) return;
    if (!(await ensureAiReady())) return;

    try {
      const existingInfo = await invoke<{ path: string; exists: boolean }>('get_card_script_info', {
        cdbPath: tab.cdbPath,
        cardId: tab.cardCode,
      });

      if (existingInfo.exists) {
        const shouldOverwrite = await ask($_('editor.script_overwrite_confirm', {
          values: { code: String(tab.cardCode) },
        }), {
          title: $_('editor.script_overwrite_title'),
          kind: 'warning',
        });
        if (!shouldOverwrite) return;
      }

      const sourceTabId = tab.sourceTabId || $tabs.find((item) => item.path === tab.cdbPath)?.id || null;
      const latestCard = sourceTabId
        ? normalizeCardContext(await getCardByIdInTab(sourceTabId, tab.cardCode))
        : normalizeCardContext(cardContext);
      const targetCard = latestCard ?? normalizeCardContext(cardContext);

      if (!targetCard) {
        showToast($_('editor.script_generate_failed'), 'error');
        return;
      }

      isGeneratingScript = true;
      scriptGenerationStage = 'collecting_references';
      const abortController = new AbortController();
      scriptGenerationAbortController = abortController;

      const { generateCardScript } = await import('$lib/utils/ai');
      const generatedScript = normalizeGeneratedScript(await generateCardScript(targetCard, {
        signal: abortController.signal,
        onStageChange: (stage) => {
          scriptGenerationStage = stage;
        },
      }));

      const written = await invoke<{ path: string; exists: boolean }>('write_card_script', {
        cdbPath: tab.cdbPath,
        cardId: tab.cardCode,
        content: generatedScript,
        overwrite: true,
      });

      syncScriptTabFromSavedContent({
        cdbPath: tab.cdbPath,
        sourceTabId: sourceTabId,
        cardCode: tab.cardCode,
        cardName: targetCard.name ?? tab.cardName,
        scriptPath: written.path,
        content: generatedScript,
      });
      showToast($_('editor.script_generated', { values: { code: String(tab.cardCode) } }), 'success');
    } catch (error) {
      if (isAbortError(error)) {
        showToast($_('editor.script_generation_canceled'), 'info');
        return;
      }

      console.error('Failed to generate script', error);
      void writeErrorLog({
        source: 'script.generate',
        error,
        extra: {
          cdbPath: tab.cdbPath,
          cardCode: tab.cardCode,
          cardName: tab.cardName,
        },
      });
      showToast($_('editor.script_generate_failed'), 'error');
    } finally {
      isGeneratingScript = false;
      scriptGenerationStage = '';
      scriptGenerationAbortController = null;
    }
  }

  function handleCancelGenerateScript() {
    scriptGenerationAbortController?.abort();
  }

  async function handleReload() {
    const tab = getActiveScriptTab();
    if (!tab || isReloading) return;

    if (tab.isDirty) {
      const confirmed = await ask($_('editor.script_reload_confirm'), {
        title: $_('editor.script_reload_title'),
        kind: 'warning',
      });
      if (!confirmed) return;
    }

    try {
      isReloading = true;
      const ok = await reloadActiveScriptTab();
      if (ok) {
        await loadCardContext();
        await syncEditorWithActiveTab();
        showToast($_('editor.script_reload_success'), 'success');
      }
    } catch (error) {
      console.error('Failed to reload script', error);
      void writeErrorLog({
        source: 'script.reload',
        error,
        extra: {
          path: tab.scriptPath,
          cardCode: tab.cardCode,
        },
      });
      showToast($_('editor.script_reload_failed'), 'error');
    } finally {
      isReloading = false;
    }
  }

  async function handleOpenExternal() {
    const tab = getActiveScriptTab();
    if (!tab) return;

    try {
      await invoke('open_in_system_editor', { path: tab.scriptPath });
    } catch (error) {
      console.error('Failed to open script externally', error);
      void writeErrorLog({
        source: 'script.open-external',
        error,
        extra: {
          path: tab.scriptPath,
          cardCode: tab.cardCode,
        },
      });
      showToast($_('editor.script_open_failed'), 'error');
    }
  }

  onMount(async () => {
    const loadedModule = await import('$lib/utils/luaScriptMonaco');
    const loadedMonaco = await loadedModule.loadMonaco();
    monacoModule = loadedModule;
    monacoApi = loadedMonaco;

    if (!editorHost) return;

    editorInstance = loadedMonaco.editor.create(editorHost, {
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 14,
      lineHeight: 22,
      lineNumbersMinChars: 3,
      scrollBeyondLastLine: false,
      wordWrap: 'on',
      tabSize: 2,
      insertSpaces: false,
      language: 'lua',
      renderWhitespace: 'selection',
      smoothScrolling: true,
      suggest: {
        showInlineDetails: true,
      },
      padding: {
        top: 0,
        bottom: 0,
      },
    });

    editorInstance.onDidChangeModelContent(() => {
      if (isApplyingModel || !currentBoundTabId) return;
      const model = editorInstance?.getModel();
      if (!model || !monacoModule) return;

      updateScriptTabContent(currentBoundTabId, model.getValue());
      monacoModule.validateLuaModel(model);
      refreshSuggestHint();
    });

    editorInstance.onDidChangeCursorPosition(() => {
      refreshSuggestHint();
    });

    editorInstance.onKeyUp(() => {
      refreshSuggestHint();
    });

    editorInstance.onDidBlurEditorText(() => {
      clearSuggestHint();
    });

    themeObserver = new MutationObserver(() => {
      monacoModule?.syncMonacoTheme();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    isMonacoReady = true;
    await loadCardContext();
    await syncEditorWithActiveTab();
  });

  onDestroy(() => {
    scriptGenerationAbortController?.abort();
    clearSuggestHint();
    if (editorInstance && currentBoundTabId) {
      setScriptTabViewState(currentBoundTabId, editorInstance.saveViewState());
    }
    themeObserver?.disconnect();
    themeObserver = null;
    editorInstance?.dispose();
  });

  $effect(() => {
    const contextKey = [
      $activeScriptTab?.id ?? '',
      $activeScriptTab?.cdbPath ?? '',
      String($activeScriptTab?.cardCode ?? 0),
      $activeScriptTab?.sourceTabId ?? '',
      $tabs.map((item) => `${item.id}:${item.path}`).join('|'),
    ].join('::');

    if (!isMonacoReady) return;
    if (contextKey === lastContextKey) return;
    lastContextKey = contextKey;

    void (async () => {
      await loadCardContext();
      await syncEditorWithActiveTab();
    })();
  });

  $effect(() => {
    if (!isMonacoReady || !monacoModule || !editorInstance) return;
    const model = editorInstance.getModel();
    if (!model) return;

    monacoModule.setModelContext(model, {
      cardCode: $activeScriptTab?.cardCode ?? 0,
      cardName: $activeScriptTab?.cardName ?? '',
      strings: scriptStrings,
      card: cardContext,
    });
    monacoModule.validateLuaModel(model);
    refreshSuggestHint();
  });
</script>

{#if $activeScriptTab}
  <section class="script-page">
    <div class="script-toolbar">
      <div class="script-toolbar-main">
        <h2>{getScriptTabTitle()}</h2>
        <div class="script-meta">
          <span>{$_('editor.script_workspace_card', { values: { code: String($activeScriptTab.cardCode) } })}</span>
          <span>{cardContext?.name || $activeScriptTab.cardName || '-'}</span>
          <span title={$activeScriptTab.cdbPath}>{$activeScriptTab.cdbPath}</span>
        </div>
      </div>
      <div class="script-toolbar-actions">
        {#if HAS_AI_FEATURE}
          <button class="btn-secondary" type="button" onclick={handleGenerateScript} disabled={isGeneratingScript}>
            {isGeneratingScript ? $_('editor.script_generating') : $_('editor.script_generate_button')}
          </button>
          {#if isGeneratingScript}
            <button class="btn-secondary" type="button" onclick={handleCancelGenerateScript}>
              {$_('editor.script_cancel_button')}
            </button>
          {/if}
        {/if}
        <button class="btn-secondary" type="button" onclick={handleReload} disabled={isReloading}>
          {isReloading ? $_('editor.script_reloading') : $_('editor.script_reload')}
        </button>
        <button class="btn-secondary" type="button" onclick={handleOpenExternal}>
          {$_('editor.script_open_external')}
        </button>
        <button class="btn-primary" type="button" onclick={handleSave} disabled={isSaving}>
          {isSaving ? $_('editor.script_saving') : $_('editor.script_save')}
        </button>
      </div>
    </div>
    {#if HAS_AI_FEATURE && isGeneratingScript}
      <div class="script-stage-banner">{getScriptGenerationStageLabel(scriptGenerationStage)}</div>
    {/if}

    <div class="script-layout">
      <div class="script-editor-shell">
        {#if suggestHintText}
          <div class="suggest-inline-hint">{suggestHintText}</div>
        {/if}
        <div class="script-editor" bind:this={editorHost}></div>
      </div>

      <aside class="script-side-panel">
        <section class="script-side-card">
          <h3>{$_('editor.desc')}</h3>
          <div class="effect-text">{cardContext?.desc || $_('editor.script_effect_empty')}</div>
        </section>

        <section class="script-side-card">
          <h3>{$_('editor.script_strings_title')}</h3>
          <div class="string-list">
            {#each scriptStrings as value, index}
              <div class="string-row">
                <span class="string-label">aux.Stringid(id, {index})</span>
                <input
                  class="string-input"
                  type="text"
                  value={value}
                  placeholder={$_('editor.script_string_empty')}
                  oninput={(event) => handleStringInput(index, (event.currentTarget as HTMLInputElement).value)}
                  onblur={() => void handleStringBlur(index)}
                />
              </div>
            {/each}
          </div>
        </section>
      </aside>
    </div>
  </section>
{:else}
  <section class="script-empty">
    <h2>{$_('editor.script_empty_title')}</h2>
    <p>{$_('editor.script_empty_description')}</p>
  </section>
{/if}

<style>
  .script-page {
    height: 100%;
    display: flex;
    flex-direction: column;
    background:
      radial-gradient(circle at top left, rgba(59, 130, 246, 0.12), transparent 26%),
      radial-gradient(circle at right top, rgba(16, 185, 129, 0.12), transparent 24%),
      var(--bg-base);
  }

  .script-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 6px 10px;
    border-bottom: 1px solid var(--border-color);
    background: color-mix(in srgb, var(--bg-surface) 88%, transparent);
  }

  .script-toolbar-main {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .script-toolbar-main h2 {
    margin: 0;
    font-size: 0.9rem;
    line-height: 1.15;
  }

  .script-meta {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    color: var(--text-secondary);
    font-size: 0.72rem;
    line-height: 1.2;
  }

  .script-meta span {
    max-width: 20rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .script-toolbar-actions {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }

  .script-stage-banner {
    padding: 4px 10px;
    border-bottom: 1px solid color-mix(in srgb, var(--border-color) 88%, transparent);
    color: var(--text-secondary);
    font-size: 0.72rem;
    line-height: 1.2;
    background: color-mix(in srgb, var(--bg-surface) 82%, transparent);
  }

  .script-layout {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 272px;
  }

  .script-editor-shell {
    min-width: 0;
    min-height: 0;
    padding: 6px 6px 6px 8px;
    position: relative;
  }

  .script-editor {
    height: 100%;
    min-height: 0;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 8px 18px rgba(15, 23, 42, 0.1);
    background: #1c2422;
  }

  .script-editor :global(.monaco-editor),
  .script-editor :global(.monaco-editor-background),
  .script-editor :global(.monaco-editor .margin),
  .script-editor :global(.monaco-editor .monaco-editor-background) {
    background:
      repeating-linear-gradient(
        to bottom,
        rgba(0, 0, 0, 0) 0,
        rgba(0, 0, 0, 0) 21px,
        rgba(174, 216, 186, 0.07) 21px,
        rgba(174, 216, 186, 0.07) 22px
      ),
      #1c2422 !important;
  }

  .script-editor :global(.monaco-editor) {
    --vscode-editor-selectionBackground: rgba(84, 135, 108, 0.22) !important;
    --vscode-editor-inactiveSelectionBackground: rgba(84, 135, 108, 0.14) !important;
    --vscode-editor-lineHighlightBackground: rgba(84, 135, 108, 0.1) !important;
    --vscode-editorError-background: rgba(196, 122, 112, 0.12) !important;
    --vscode-editorError-border: rgba(196, 122, 112, 0.28) !important;
    --vscode-editorWarning-background: rgba(196, 168, 102, 0.1) !important;
    --vscode-editorWarning-border: rgba(196, 168, 102, 0.22) !important;
    --vscode-editorInfo-background: rgba(113, 162, 181, 0.08) !important;
    --vscode-editorInfo-border: rgba(113, 162, 181, 0.2) !important;
  }

  .script-editor :global(.monaco-editor .focused .selected-text),
  .script-editor :global(.monaco-editor .selected-text) {
    background-color: rgba(84, 135, 108, 0.22) !important;
  }

  .script-editor :global(.monaco-editor .view-overlays .current-line),
  .script-editor :global(.monaco-editor .margin-view-overlays .current-line) {
    background-color: rgba(84, 135, 108, 0.1) !important;
    border: none !important;
  }

  .script-editor :global(.monaco-editor .squiggly-error:before) {
    background: rgba(196, 122, 112, 0.12) !important;
  }

  .script-editor :global(.monaco-editor .squiggly-warning:before) {
    background: rgba(196, 168, 102, 0.1) !important;
  }

  .script-editor :global(.monaco-editor .squiggly-info:before) {
    background: rgba(113, 162, 181, 0.08) !important;
  }

  .script-editor :global(.monaco-editor .squiggly-error) {
    border-bottom: 2px solid rgba(196, 122, 112, 0.34) !important;
  }

  .script-editor :global(.monaco-editor .squiggly-warning) {
    border-bottom: 2px solid rgba(196, 168, 102, 0.28) !important;
  }

  .script-editor :global(.monaco-editor .squiggly-info) {
    border-bottom: 2px solid rgba(113, 162, 181, 0.24) !important;
  }

  .suggest-inline-hint {
    position: absolute;
    top: 12px;
    right: 14px;
    max-width: min(52vw, 880px);
    padding: 0.35rem 0.65rem;
    border-radius: 8px;
    background: rgba(20, 28, 26, 0.58);
    color: rgba(205, 220, 210, 0.46);
    font-size: 0.8rem;
    line-height: 1.42;
    font-style: italic;
    pointer-events: none;
    white-space: normal;
    overflow: hidden;
    word-break: break-word;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 4;
    line-clamp: 4;
    backdrop-filter: blur(2px);
    z-index: 6;
  }

  :global([data-theme='light']) .script-editor {
    background: #f4f8f3;
  }

  :global([data-theme='light']) .script-editor :global(.monaco-editor),
  :global([data-theme='light']) .script-editor :global(.monaco-editor-background),
  :global([data-theme='light']) .script-editor :global(.monaco-editor .margin),
  :global([data-theme='light']) .script-editor :global(.monaco-editor .monaco-editor-background) {
    background:
      repeating-linear-gradient(
        to bottom,
        rgba(0, 0, 0, 0) 0,
        rgba(0, 0, 0, 0) 21px,
        rgba(104, 145, 112, 0.08) 21px,
        rgba(104, 145, 112, 0.08) 22px
      ),
      #f4f8f3 !important;
  }

  :global([data-theme='light']) .script-editor :global(.monaco-editor) {
    --vscode-editor-selectionBackground: rgba(97, 141, 106, 0.18) !important;
    --vscode-editor-inactiveSelectionBackground: rgba(97, 141, 106, 0.12) !important;
    --vscode-editor-lineHighlightBackground: rgba(97, 141, 106, 0.08) !important;
    --vscode-editorError-background: rgba(198, 128, 117, 0.08) !important;
    --vscode-editorError-border: rgba(198, 128, 117, 0.2) !important;
    --vscode-editorWarning-background: rgba(189, 155, 86, 0.08) !important;
    --vscode-editorWarning-border: rgba(189, 155, 86, 0.2) !important;
    --vscode-editorInfo-background: rgba(94, 144, 166, 0.06) !important;
    --vscode-editorInfo-border: rgba(94, 144, 166, 0.16) !important;
  }

  :global([data-theme='light']) .suggest-inline-hint {
    background: rgba(244, 248, 243, 0.78);
    color: rgba(72, 98, 84, 0.5);
  }

  .script-side-panel {
    border-left: 1px solid var(--border-color);
    padding: 6px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
    background: color-mix(in srgb, var(--bg-surface) 76%, transparent);
  }

  .script-side-card {
    border: 1px solid var(--border-color);
    border-radius: 8px;
    background: color-mix(in srgb, var(--bg-surface) 94%, transparent);
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .script-side-card h3 {
    margin: 0;
    font-size: 0.8rem;
  }

  .effect-text,
  .string-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .effect-text {
    color: var(--text-secondary);
    font-size: 0.77rem;
    line-height: 1.45;
    white-space: pre-wrap;
    word-break: break-word;
    padding: 0;
  }

  .string-list {
    color: var(--text-secondary);
  }

  .string-row {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 5px 0;
    border-bottom: 1px solid var(--border-color);
  }

  .string-row:last-child {
    border-bottom: none;
  }

  .string-label {
    color: var(--accent-primary);
    font-size: 0.7rem;
    font-family: Consolas, 'Courier New', monospace;
  }

  .string-input {
    width: 100%;
    height: 1.8rem;
    min-height: 1.8rem;
    resize: none;
    border-radius: 7px;
    border: 1px solid color-mix(in srgb, var(--border-color) 88%, transparent);
    background: color-mix(in srgb, var(--bg-base) 90%, transparent);
    color: var(--text-secondary);
    font-size: 0.76rem;
    line-height: 1.2;
    padding: 0.24rem 0.48rem;
  }

  .string-input:focus {
    outline: none;
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent-primary) 45%, transparent);
  }

  .script-empty {
    height: 100%;
    display: grid;
    place-items: center;
    text-align: center;
    color: var(--text-secondary);
    gap: 10px;
  }

  button {
    font: inherit;
  }

  .btn-primary,
  .btn-secondary {
    border-radius: 8px;
    padding: 0.34rem 0.6rem;
    font-size: 0.76rem;
    font-weight: 700;
    line-height: 1.1;
  }

  .btn-primary {
    background: linear-gradient(135deg, #2563eb, #0891b2);
    color: white;
  }

  .btn-secondary {
    background: var(--bg-base);
    border: 1px solid var(--border-color);
    color: var(--text-primary);
  }

  @media (max-width: 1180px) {
    .script-layout {
      grid-template-columns: 1fr;
      grid-template-rows: minmax(0, 1fr) auto;
    }

    .script-side-panel {
      border-left: none;
      border-top: 1px solid var(--border-color);
      max-height: 38vh;
    }
  }
</style>
