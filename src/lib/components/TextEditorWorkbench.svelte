<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { _ } from 'svelte-i18n';
  import {
    activeTextTab,
    getActiveTextTab,
    getTextTabLanguage,
    saveTextTab,
    saveTextTabAs,
    setTextTabViewState,
    updateTextTabContent,
  } from '$lib/stores/textEditor.svelte';
  import { showToast } from '$lib/stores/toast.svelte';
  import { attachFontZoomActions } from '$lib/features/script-editor/runtime';
  import {
    setWorkspaceLifecycleMetadata,
    setWorkspaceSaveHandler,
    clearWorkspaceSaveHandler,
  } from '$lib/application/workspace/lifecycle';
  import { buildCallHighlightDecorations } from '$lib/features/script-editor/controller';
  import { collectLuaInlineHighlights } from '$lib/features/script-editor/lua/calls';
  import type { editor as MonacoEditor } from 'monaco-editor';

  type MonacoModule = typeof import('$lib/features/script-editor/monaco/setup');
  type MonacoApi = typeof import('monaco-editor');

  const LUA_MARKER_OWNER = 'dataeditory-lua';

  let editorHost = $state<HTMLDivElement | null>(null);
  let monacoModule = $state<MonacoModule | null>(null);
  let monacoApi = $state<MonacoApi | null>(null);
  let editorInstance = $state<MonacoEditor.IStandaloneCodeEditor | null>(null);
  let callHighlightDecorations = $state<MonacoEditor.IEditorDecorationsCollection | null>(null);
  let isMonacoReady = $state(false);
  let isSaving = $state(false);
  let currentBoundTabId = $state<string | null>(null);
  let isApplyingModel = false;
  let validateTimer: ReturnType<typeof setTimeout> | null = null;
  let lastHighlightSource = '';
  let lastHighlightDecorations: import('$lib/features/script-editor/controller').MonacoDecoration[] = [];
  let themeObserver: MutationObserver | null = null;
  let windowKeydownHandler: ((event: KeyboardEvent) => void) | null = null;
  let disposeFontZoom: (() => void) | null = null;

  const activeTab = $derived($activeTextTab);

  function modelUriFor(tabId: string, path: string) {
    const ext = path.toLowerCase().split('.').pop() ?? 'txt';
    return monacoApi!.Uri.parse(`inmemory://dataeditory/text-${tabId}.${ext}`);
  }

  function scheduleLuaValidation() {
    if (!editorInstance || !monacoModule) return;
    clearTimeout(validateTimer ?? undefined);
    validateTimer = setTimeout(() => {
      const model = editorInstance?.getModel();
      if (!model) return;
      monacoModule!.validateLuaModel(model);
      syncCallHighlights();
    }, 80);
  }

  function syncCallHighlights() {
    if (!editorInstance) return;
    const model = editorInstance.getModel();
    if (!model) {
      callHighlightDecorations?.clear();
      lastHighlightSource = '';
      lastHighlightDecorations = [];
      return;
    }
    const source = model.getValue();
    const next = buildCallHighlightDecorations(
      source,
      lastHighlightSource,
      lastHighlightDecorations,
      collectLuaInlineHighlights,
    );
    lastHighlightSource = next.source;
    lastHighlightDecorations = next.decorations;
    callHighlightDecorations ??= editorInstance.createDecorationsCollection();
    callHighlightDecorations.set(next.decorations);
  }

  function clearLuaMarkers() {
    if (!editorInstance || !monacoApi) return;
    const model = editorInstance.getModel();
    if (model) monacoApi.editor.setModelMarkers(model, LUA_MARKER_OWNER, []);
  }

  async function syncEditorWithActiveTab() {
    if (!editorInstance || !monacoModule || !monacoApi) return;
    const tab = getActiveTextTab();
    if (!tab) {
      if (currentBoundTabId) {
        const oldModel = editorInstance.getModel();
        if (oldModel) setTextTabViewState(currentBoundTabId, editorInstance.saveViewState());
      }
      currentBoundTabId = null;
      editorInstance.setModel(null);
      return;
    }

    if (currentBoundTabId && currentBoundTabId !== tab.id) {
      const oldModel = editorInstance.getModel();
      if (oldModel) setTextTabViewState(currentBoundTabId, editorInstance.saveViewState());
    }

    const uri = modelUriFor(tab.id, tab.path);
    const language = getTextTabLanguage(tab);
    let model = monacoApi.editor.getModel(uri);
    const currentModel = editorInstance.getModel();
    const isSwitchingTab = currentBoundTabId !== tab.id || currentModel?.uri.toString() !== uri.toString();

    if (!model) {
      model = monacoApi.editor.createModel(tab.content, language, uri);
    } else if (isSwitchingTab) {
      isApplyingModel = true;
      model.setValue(tab.content);
      monacoApi.editor.setModelLanguage(model, language);
      isApplyingModel = false;
    }

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
    lastHighlightSource = '';
    lastHighlightDecorations = [];

    if (language === 'lua') {
      scheduleLuaValidation();
    } else {
      clearLuaMarkers();
      callHighlightDecorations?.clear();
      callHighlightDecorations = null;
    }
  }

  function syncLifecycleMetadata() {
    const tab = $activeTextTab;
    if (!tab) {
      if (currentBoundTabId) {
        clearWorkspaceSaveHandler(currentBoundTabId);
      }
      return;
    }
    setWorkspaceLifecycleMetadata(tab.id, {
      dirty: tab.isDirty,
      status: 'ready',
      savePolicy: 'manual',
      closeGuard: 'confirm-dirty',
    });
    setWorkspaceSaveHandler(tab.id, async (destinationPath?: string) => {
      if (destinationPath) return saveTextTab(tab.id, destinationPath);
      return saveTextTab(tab.id);
    });
  }

  async function handleSave() {
    const tab = getActiveTextTab();
    if (!tab || isSaving) return;
    isSaving = true;
    try {
      const ok = await saveTextTab(tab.id);
      showToast(ok ? $_('nav.save') + ' OK' : $_('nav.save') + ' failed', ok ? 'success' : 'error');
    } finally {
      isSaving = false;
    }
  }

  async function handleSaveAs() {
    const tab = getActiveTextTab();
    if (!tab) return;
    await saveTextTabAs(tab.id);
  }

  async function handleReload() {
    const tab = getActiveTextTab();
    if (!tab || !editorInstance || !monacoApi) return;
    const { readTextFile } = await import('$lib/infrastructure/tauri/commands');
    try {
      const content = (await readTextFile(tab.path)).replaceAll('\r\n', '\n');
      const model = editorInstance.getModel();
      if (model) {
        isApplyingModel = true;
        model.setValue(content);
        isApplyingModel = false;
      }
      updateTextTabContent(tab.id, content);
      if (getTextTabLanguage(tab) === 'lua') scheduleLuaValidation();
      showToast('Reloaded', 'success');
    } catch (error) {
      console.error('Failed to reload:', error);
      showToast('Reload failed', 'error');
    }
  }

  onMount(async () => {
    if (!editorHost) return;
    let destroyed = false;
    onDestroy(() => { destroyed = true; });

    const loadedModule = await import('$lib/features/script-editor/monaco/setup');
    const loadedMonaco = await loadedModule.loadMonaco();

    if (destroyed) return;

    monacoModule = loadedModule;
    monacoApi = loadedMonaco;

    editorInstance = loadedMonaco.editor.create(editorHost, {
      automaticLayout: true,
      contextmenu: true,
      minimap: { enabled: true },
      fontSize: 14,
      lineHeight: 22,
      lineNumbersMinChars: 3,
      scrollBeyondLastLine: false,
      wordWrap: 'on',
      tabSize: 2,
      insertSpaces: false,
      language: 'plaintext',
      renderWhitespace: 'selection',
      smoothScrolling: true,
      padding: { top: 0, bottom: 0 },
      unicodeHighlight: {
        nonBasicASCII: false,
        invisibleCharacters: false,
        ambiguousCharacters: false,
      },
    });
    callHighlightDecorations = editorInstance.createDecorationsCollection();
    disposeFontZoom = attachFontZoomActions(editorInstance, loadedMonaco);

    editorInstance.onDidChangeModelContent(() => {
      if (isApplyingModel || !currentBoundTabId) return;
      const model = editorInstance?.getModel();
      if (!model) return;
      updateTextTabContent(currentBoundTabId, model.getValue());
      const tab = getActiveTextTab();
      if (tab && getTextTabLanguage(tab) === 'lua') {
        scheduleLuaValidation();
      }
    });

    themeObserver = new MutationObserver(() => loadedModule.syncMonacoTheme());
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    windowKeydownHandler = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.isComposing) return;
      const isPrimary = event.ctrlKey || event.metaKey;
      if (isPrimary && !event.shiftKey && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void handleSave();
      }
    };
    window.addEventListener('keydown', windowKeydownHandler);

    isMonacoReady = true;
    await syncEditorWithActiveTab();
    syncLifecycleMetadata();
  });

  onDestroy(() => {
    if (editorInstance && currentBoundTabId) {
      const model = editorInstance.getModel();
      if (model) setTextTabViewState(currentBoundTabId, editorInstance.saveViewState());
    }
    if (currentBoundTabId) clearWorkspaceSaveHandler(currentBoundTabId);
    clearTimeout(validateTimer ?? undefined);
    validateTimer = null;
    themeObserver?.disconnect();
    themeObserver = null;
    if (windowKeydownHandler) {
      window.removeEventListener('keydown', windowKeydownHandler);
      windowKeydownHandler = null;
    }
    callHighlightDecorations?.clear();
    callHighlightDecorations = null;
    disposeFontZoom?.();
    disposeFontZoom = null;
    editorInstance?.dispose();
    editorInstance = null;
  });

  $effect(() => {
    if (!isMonacoReady) return;
    void $activeTextTab?.id;
    void syncEditorWithActiveTab();
  });

  $effect(() => {
    if (!isMonacoReady || !editorInstance || !monacoApi) return;
    const tab = $activeTextTab;
    if (!tab || currentBoundTabId !== tab.id) return;
    // Only react to external content changes (e.g. reload), not our own edits.
    void tab.content;
    const model = editorInstance.getModel();
    if (!model) return;
    if (model.getValue() === tab.content) return;
    isApplyingModel = true;
    model.setValue(tab.content);
    isApplyingModel = false;
  });

  $effect(() => {
    syncLifecycleMetadata();
  });
</script>

{#if activeTab}
  <section class="text-workbench">
    <div class="text-toolbar">
      <span class="text-title" title={activeTab.path}>{activeTab.name}</span>
      <span class="text-path">{activeTab.path}</span>
      <span class="text-spacer"></span>
      <button type="button" class="text-btn" onclick={handleReload} disabled={isSaving}>
        {$_('editor.script_reload')}
      </button>
      <button type="button" class="text-btn" onclick={handleSaveAs} disabled={isSaving}>
        {$_('nav.save_as')}
      </button>
      <button type="button" class="text-btn primary" onclick={handleSave} disabled={isSaving}>
        {isSaving ? $_('editor.script_saving') : $_('nav.save')}
      </button>
    </div>
    <div class="text-editor" bind:this={editorHost}></div>
  </section>
{:else}
  <div class="text-empty">{$_('editor.script_empty_title')}</div>
{/if}

<style>
  .text-workbench {
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: var(--bg-base);
  }

  .text-toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border-bottom: 1px solid var(--border-color);
    background: var(--bg-surface);
    flex-shrink: 0;
  }

  .text-title {
    font-weight: 600;
    color: var(--text-primary);
    max-width: 260px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .text-path {
    font-size: 0.85em;
    color: var(--text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .text-spacer {
    flex: 1;
  }

  .text-btn {
    padding: 4px 12px;
    border: 1px solid var(--border-color);
    border-radius: var(--control-radius, 6px);
    background: var(--bg-surface);
    color: var(--text-secondary);
    cursor: pointer;
    font: inherit;
  }

  .text-btn:hover:not(:disabled) {
    background: var(--bg-surface-hover);
    color: var(--text-primary);
  }

  .text-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .text-btn.primary {
    background: var(--accent-primary);
    color: white;
    border-color: var(--accent-primary);
  }

  .text-btn.primary:hover:not(:disabled) {
    color: white;
    filter: brightness(1.08);
  }

  .text-editor {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .text-editor :global(.monaco-editor) {
    --vscode-editor-selectionBackground: rgba(87, 166, 121, 0.28) !important;
    --vscode-editor-inactiveSelectionBackground: rgba(87, 166, 121, 0.18) !important;
    --vscode-editor-lineHighlightBackground: rgba(118, 184, 151, 0.12) !important;
  }

  .text-editor :global(.monaco-editor .view-overlays .current-line),
  .text-editor :global(.monaco-editor .margin-view-overlays .current-line) {
    background-color: rgba(118, 184, 151, 0.12) !important;
    border: none !important;
  }

  :global([data-theme='light']) .text-editor :global(.monaco-editor) {
    --vscode-editor-selectionBackground: rgba(97, 141, 106, 0.22) !important;
    --vscode-editor-inactiveSelectionBackground: rgba(97, 141, 106, 0.14) !important;
    --vscode-editor-lineHighlightBackground: rgba(74, 133, 91, 0.1) !important;
  }

  :global([data-theme='light']) .text-editor :global(.monaco-editor .view-overlays .current-line),
  :global([data-theme='light']) .text-editor :global(.monaco-editor .margin-view-overlays .current-line) {
    background-color: rgba(74, 133, 91, 0.1) !important;
  }

  .text-empty {
    display: grid;
    place-items: center;
    height: 100%;
    color: var(--text-secondary);
  }
</style>
