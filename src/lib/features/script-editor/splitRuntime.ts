import { get } from 'svelte/store';
import { _ } from 'svelte-i18n';
import type { editor as MonacoEditor } from 'monaco-editor';
import type { CardDataEntry, ScriptWorkspaceState } from '$lib/types';
import { appSettingsState } from '$lib/stores/appSettings.svelte';
import { scriptTabs, focusScriptTab, registerScriptModelDisposer, setScriptTabViewState, updateScriptTabContent } from '$lib/stores/scriptEditor.svelte';
import { getCardByIdInTab } from '$lib/stores/db';
import { normalizeScriptContent } from '$lib/domain/script/workspace';
import { attachFontZoomActions, attachSnippetTabNavigation, buildScriptEditorMonacoOptions } from './runtime';
import { attachScriptContextMenu } from './contextMenu';
import { shareScriptImageFlow } from './useCases';
import { buildScriptImageRenderInfo } from './view';

export async function createSplitScriptRuntime(input: {
  host: HTMLDivElement;
  left: ScriptWorkspaceState;
  right: ScriptWorkspaceState;
  compare: boolean;
  isCancelled: () => boolean;
}) {
  const module = await import('./monaco/setup');
  const monaco = await module.loadMonaco();
  if (input.isCancelled()) return null;
  let disposed = false;
  registerScriptModelDisposer(module.disposeScriptModel);
  const latest = (id: string) => get(scriptTabs).find((tab) => tab.id === id);
  const tabs = [latest(input.left.id), latest(input.right.id)];
  if (!tabs[0] || !tabs[1]) return null;
  const models = tabs.map((tab) => {
    const uri = module.createScriptModelUri(tab!.id);
    const model = monaco.editor.getModel(uri) ?? monaco.editor.createModel(tab!.content, 'lua', uri);
    model.setEOL(monaco.editor.EndOfLineSequence.LF);
    if (normalizeScriptContent(model.getValue()) !== tab!.content) model.setValue(tab!.content);
    return model;
  });
  // Each runtime owns a container, so stale async cleanup cannot remove its successor.
  const container = document.createElement('div');
  container.style.cssText = 'width:100%;height:100%;min-width:0;';
  input.host.appendChild(container);
  const options = buildScriptEditorMonacoOptions(appSettingsState.values.scriptEditorFontSize);
  let diff: MonacoEditor.IStandaloneDiffEditor | null = null;
  let editors: MonacoEditor.IStandaloneCodeEditor[];
  if (input.compare) {
    diff = monaco.editor.createDiffEditor(container, {
      ...options, originalEditable: true, readOnly: false, renderSideBySide: true,
      useInlineViewWhenSpaceIsLimited: false, enableSplitViewResizing: true,
      ignoreTrimWhitespace: false, renderMarginRevertIcon: false, renderGutterMenu: false,
    });
    diff.setModel({ original: models[0], modified: models[1] });
    editors = [diff.getOriginalEditor(), diff.getModifiedEditor()];
  } else {
    container.style.display = 'flex';
    editors = models.map((model) => {
      const pane = document.createElement('div');
      pane.style.cssText = 'flex:1;min-width:0;height:100%;';
      container.appendChild(pane);
      if (container.childElementCount > 1) pane.style.borderLeft = '1px solid var(--border-color)';
      return monaco.editor.create(pane, { ...options, model });
    });
  }
  const disposers: Array<() => void> = [];
  editors.forEach((instance, index) => {
    const tab = tabs[index]!;
    instance.updateOptions({ ariaLabel: String(get(_)(index === 0 ? 'context_menu.left_script' : 'context_menu.right_script')) });
    let applying = false;
    let validationTimer: ReturnType<typeof setTimeout> | undefined;
    if (tab.viewState) instance.restoreViewState(tab.viewState as MonacoEditor.ICodeEditorViewState);
    const contentListener = instance.onDidChangeModelContent(() => {
      if (applying || disposed) return;
      updateScriptTabContent(tab.id, models[index].getValue());
      clearTimeout(validationTimer);
      validationTimer = setTimeout(() => { if (!disposed && !models[index].isDisposed()) module.validateLuaModel(models[index]); }, 200);
    });
    const focusListener = instance.onDidFocusEditorText(() => focusScriptTab(tab.id));
    const unsubscribe = scriptTabs.subscribe((current) => {
      const next = current.find((item) => item.id === tab.id);
      if (!next || models[index].isDisposed() || normalizeScriptContent(models[index].getValue()) === next.content) return;
      applying = true;
      models[index].setValue(next.content);
      applying = false;
    });
    let card: CardDataEntry | null = null;
    if (tab.sourceTabId) void getCardByIdInTab(tab.sourceTabId, tab.cardCode).then((value) => {
      if (disposed || models[index].isDisposed()) return;
      card = value ?? null;
      module.setModelContext(models[index], { cardCode: tab.cardCode, cardName: tab.cardName, strings: value?.strings ?? [], card: value ?? null });
      module.validateLuaModel(models[index]);
    }).catch(() => {});
    let sharing = false;
    const menuDisposer = attachScriptContextMenu(instance, async () => {
      const selection = instance.getSelection();
      const current = latest(tab.id);
      if (!selection || selection.isEmpty() || !current || sharing) return;
      const end = selection.endColumn === 1 && selection.endLineNumber > selection.startLineNumber ? selection.endLineNumber - 1 : selection.endLineNumber;
      const content = Array.from({ length: end - selection.startLineNumber + 1 }, (_, line) => models[index].getLineContent(selection.startLineNumber + line)).join('\n');
      sharing = true;
      try {
        await shareScriptImageFlow({ tab: current, isSharing: false,
          selection: { content, startLineNumber: selection.startLineNumber },
          renderInfo: buildScriptImageRenderInfo({ cardContext: card, fallbackCode: current.cardCode, title: `c${current.cardCode}.lua`, t: get(_) }),
          t: (key, options) => String(get(_)(key, options as never)),
        });
      } finally { sharing = false; }
    });
    disposers.push(unsubscribe, () => contentListener.dispose(), () => focusListener.dispose(), menuDisposer,
      attachFontZoomActions(instance, monaco, () => appSettingsState.values.scriptEditorFontSize),
      attachSnippetTabNavigation(instance, monaco), () => clearTimeout(validationTimer));
  });
  if (diff) {
    let aligned = false;
    const align = () => {
      if (aligned || disposed) return;
      aligned = true;
      editors[1].setScrollTop(editors[0].getScrollTop());
      editors[1].setScrollLeft(editors[0].getScrollLeft());
    };
    const listener = diff.onDidUpdateDiff(align);
    disposers.push(() => listener.dispose());
  }
  const observer = new MutationObserver(() => module.syncMonacoTheme());
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return {
    dispose() {
      disposed = true;
      observer.disconnect();
      disposers.forEach((dispose) => dispose());
      editors.forEach((instance, index) => { if (latest(tabs[index]!.id)) setScriptTabViewState(tabs[index]!.id, instance.saveViewState()); });
      if (diff) diff.dispose(); else editors.forEach((instance) => instance.dispose());
      container.remove();
    },
  };
}
