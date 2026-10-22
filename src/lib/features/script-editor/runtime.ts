import { attachScriptContextMenu } from './contextMenu';
import type { editor as MonacoEditor } from 'monaco-editor';
import { DEFAULT_SCRIPT_EDITOR_FONT_SIZE, normalizeScriptEditorFontSize } from './fontPreferences';

export type ScriptMonacoModule = typeof import('$lib/features/script-editor/monaco/setup');
export type ScriptMonacoApi = typeof import('monaco-editor');

export type ScriptMonacoRuntime = {
  module: ScriptMonacoModule;
  api: ScriptMonacoApi;
  editor: MonacoEditor.IStandaloneCodeEditor;
  callHighlightDecorations: MonacoEditor.IEditorDecorationsCollection;
  dispose: () => void;
};

const FONT_ZOOM_STEP = 1;
export function attachFontZoomActions(editor: MonacoEditor.IStandaloneCodeEditor, monaco: ScriptMonacoApi, getDefaultFontSize?: () => number) {
  const { KeyMod, KeyCode } = monaco;
  const baseFontSize = editor.getOption(monaco.editor.EditorOption.fontSize) as number;

  function setFontZoom(delta: number) {
    const current = editor.getOption(monaco.editor.EditorOption.fontSize) as number;
    const next = normalizeScriptEditorFontSize(current + delta);
    editor.updateOptions({ fontSize: next });
  }

  const actions: MonacoEditor.IActionDescriptor[] = [
    {
      id: 'dataeditory.fontZoomIn',
      label: 'Increase Font Size',
      keybindings: [KeyMod.CtrlCmd | KeyCode.Equal],
      run: () => setFontZoom(FONT_ZOOM_STEP),
    },
    {
      id: 'dataeditory.fontZoomOut',
      label: 'Decrease Font Size',
      keybindings: [KeyMod.CtrlCmd | KeyCode.Minus],
      run: () => setFontZoom(-FONT_ZOOM_STEP),
    },
    {
      id: 'dataeditory.fontZoomReset',
      label: 'Reset Font Size',
      keybindings: [KeyMod.CtrlCmd | KeyCode.Numpad0, KeyMod.CtrlCmd | KeyCode.Digit0],
      run: () => editor.updateOptions({ fontSize: normalizeScriptEditorFontSize(getDefaultFontSize?.() ?? baseFontSize) }),
    },
  ];

  const disposables = actions.map((action) => editor.addAction(action));
  const host = editor.getContainerDomNode();
  const onWheel = (event: WheelEvent) => {
    if (!(event.ctrlKey || event.metaKey) || event.deltaY === 0) return;
    event.preventDefault();
    event.stopPropagation();
    setFontZoom(event.deltaY < 0 ? FONT_ZOOM_STEP : -FONT_ZOOM_STEP);
  };
  // Capture before Monaco scrolls or the webview zooms the entire page.
  host.addEventListener('wheel', onWheel, { capture: true, passive: false });
  return () => {
    host.removeEventListener('wheel', onWheel, true);
    for (const d of disposables) d.dispose();
  };
}

export function attachSnippetTabNavigation(editor: MonacoEditor.IStandaloneCodeEditor, monaco: ScriptMonacoApi) {
  const actions: MonacoEditor.IActionDescriptor[] = [
    {
      id: 'dataeditory.snippet.nextPlaceholder',
      label: 'Go to Next Snippet Placeholder',
      keybindings: [monaco.KeyCode.Tab],
      precondition: 'inSnippetMode && hasNextTabstop',
      run: (activeEditor) => activeEditor.trigger('dataeditory', 'jumpToNextSnippetPlaceholder', null),
    },
    {
      id: 'dataeditory.snippet.previousPlaceholder',
      label: 'Go to Previous Snippet Placeholder',
      keybindings: [monaco.KeyMod.Shift | monaco.KeyCode.Tab],
      precondition: 'inSnippetMode && hasPrevTabstop',
      run: (activeEditor) => activeEditor.trigger('dataeditory', 'jumpToPrevSnippetPlaceholder', null),
    },
  ];

  const disposables = actions.map((action) => editor.addAction(action));
  return () => disposables.forEach((disposable) => disposable.dispose());
}

export function buildScriptEditorMonacoOptions(fontSize = DEFAULT_SCRIPT_EDITOR_FONT_SIZE) {
  return {
    automaticLayout: true,
    contextmenu: true,
    links: true,
    minimap: { enabled: false },
    fontSize: normalizeScriptEditorFontSize(fontSize),
    // Monaco treats values below 8 as a ratio, so spacing follows every font-size change.
    lineHeight: 22 / DEFAULT_SCRIPT_EDITOR_FONT_SIZE,
    lineNumbersMinChars: 3,
    scrollBeyondLastLine: false,
    wordWrap: 'on' as const,
    tabSize: 2,
    insertSpaces: false,
    language: 'lua',
    renderWhitespace: 'selection' as const,
    smoothScrolling: true,
    unicodeHighlight: {
      nonBasicASCII: false,
      invisibleCharacters: false,
      ambiguousCharacters: false,
    },
    suggest: {
      showInlineDetails: true,
      snippetsPreventQuickSuggestions: false,
    },
    hover: {
      above: true,
      delay: 0,
    },
    padding: {
      top: 0,
      bottom: 0,
    },
  };
}

export async function createScriptMonacoRuntime(input: {
  host: HTMLDivElement;
  getDefaultFontSize?: () => number;
  onDidChangeModelContent: () => void;
  onDidChangeCursorPosition: () => void;
  onDidChangeCursorSelection: () => void;
  onKeyUp: () => void;
  onMouseMove: (position: { lineNumber: number; column: number } | null | undefined) => void;
  onDidBlurEditorText: () => void;
  onDidScrollChange: () => void;
  onWindowKeydown: (event: KeyboardEvent) => void;
  onWindowKeyup: (event: KeyboardEvent) => void;
  onWindowBlur: () => void;
  onCopySelectionImage?: () => unknown | Promise<unknown>;
}) {
  const loadedModule = await import('$lib/features/script-editor/monaco/setup');
  const loadedMonaco = await loadedModule.loadMonaco();

  const editor = loadedMonaco.editor.create(input.host, buildScriptEditorMonacoOptions(input.getDefaultFontSize?.()));
  const syncLineHeight = () => {
    input.host.style.setProperty('--script-editor-line-height', `${editor.getOption(loadedMonaco.editor.EditorOption.lineHeight)}px`);
  };
  syncLineHeight();
  const callHighlightDecorations = editor.createDecorationsCollection();
  const disposeFontZoom = attachFontZoomActions(editor, loadedMonaco, input.getDefaultFontSize);
  const disposeSnippetTabNavigation = attachSnippetTabNavigation(editor, loadedMonaco);
  const disposeContextMenu = attachScriptContextMenu(editor, () => input.onCopySelectionImage?.());
  const disposables = [
    editor.onDidChangeConfiguration((event) => {
      if (event.hasChanged(loadedMonaco.editor.EditorOption.lineHeight)) syncLineHeight();
      if (event.hasChanged(loadedMonaco.editor.EditorOption.fontInfo)) input.onDidScrollChange();
    }),
    editor.onDidChangeModelContent(input.onDidChangeModelContent),
    editor.onDidChangeCursorPosition(input.onDidChangeCursorPosition),
    editor.onDidChangeCursorSelection(input.onDidChangeCursorSelection),
    editor.onKeyUp(input.onKeyUp),
    editor.onMouseMove((event) => {
      input.onMouseMove(event.target.position);
    }),
    editor.onDidBlurEditorText(input.onDidBlurEditorText),
    editor.onDidScrollChange(input.onDidScrollChange),
  ];

  const themeObserver = new MutationObserver(() => {
    loadedModule.syncMonacoTheme();
  });
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });

  window.addEventListener('keydown', input.onWindowKeydown);
  window.addEventListener('keyup', input.onWindowKeyup);
  window.addEventListener('blur', input.onWindowBlur);

  return {
    module: loadedModule,
    api: loadedMonaco,
    editor,
    callHighlightDecorations,
    dispose() {
      for (const disposable of disposables) {
        disposable.dispose();
      }
      disposeContextMenu();
      disposeFontZoom();
      disposeSnippetTabNavigation();
      themeObserver.disconnect();
      window.removeEventListener('keydown', input.onWindowKeydown);
      window.removeEventListener('keyup', input.onWindowKeyup);
      window.removeEventListener('blur', input.onWindowBlur);
      callHighlightDecorations.clear();
      editor.dispose();
    },
  } satisfies ScriptMonacoRuntime;
}
