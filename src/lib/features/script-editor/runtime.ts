import type { editor as MonacoEditor } from 'monaco-editor';

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
const FONT_ZOOM_MIN = 8;
const FONT_ZOOM_MAX = 32;

export function attachFontZoomActions(editor: MonacoEditor.IStandaloneCodeEditor, monaco: ScriptMonacoApi) {
  const { KeyMod, KeyCode } = monaco;
  const baseFontSize = editor.getOption(monaco.editor.EditorOption.fontSize) as number;

  function setFontZoom(delta: number) {
    const current = editor.getOption(monaco.editor.EditorOption.fontSize) as number;
    const next = Math.min(FONT_ZOOM_MAX, Math.max(FONT_ZOOM_MIN, current + delta));
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
      run: () => editor.updateOptions({ fontSize: baseFontSize }),
    },
  ];

  const disposables = actions.map((action) => editor.addAction(action));
  return () => {
    for (const d of disposables) d.dispose();
  };
}

export function buildScriptEditorMonacoOptions() {
  return {
    automaticLayout: true,
    contextmenu: false,
    minimap: { enabled: false },
    fontSize: 14,
    lineHeight: 22,
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
    },
    padding: {
      top: 0,
      bottom: 0,
    },
  };
}

export async function createScriptMonacoRuntime(input: {
  host: HTMLDivElement;
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
}) {
  const loadedModule = await import('$lib/features/script-editor/monaco/setup');
  const loadedMonaco = await loadedModule.loadMonaco();

  const editor = loadedMonaco.editor.create(input.host, buildScriptEditorMonacoOptions());
  const callHighlightDecorations = editor.createDecorationsCollection();
  const disposeFontZoom = attachFontZoomActions(editor, loadedMonaco);
  const disposables = [
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
      disposeFontZoom();
      themeObserver.disconnect();
      window.removeEventListener('keydown', input.onWindowKeydown);
      window.removeEventListener('keyup', input.onWindowKeyup);
      window.removeEventListener('blur', input.onWindowBlur);
      callHighlightDecorations.clear();
      editor.dispose();
    },
  } satisfies ScriptMonacoRuntime;
}
