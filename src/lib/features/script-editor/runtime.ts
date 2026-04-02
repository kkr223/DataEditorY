import type { editor as MonacoEditor } from 'monaco-editor';

export type ScriptMonacoModule = typeof import('$lib/utils/luaScriptMonaco');
export type ScriptMonacoApi = typeof import('monaco-editor');

export type ScriptMonacoRuntime = {
  module: ScriptMonacoModule;
  api: ScriptMonacoApi;
  editor: MonacoEditor.IStandaloneCodeEditor;
  callHighlightDecorations: MonacoEditor.IEditorDecorationsCollection;
  dispose: () => void;
};

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
  onKeyUp: () => void;
  onMouseMove: (position: { lineNumber: number; column: number } | null | undefined) => void;
  onDidBlurEditorText: () => void;
  onDidScrollChange: () => void;
  onWindowKeydown: (event: KeyboardEvent) => void;
  onWindowKeyup: (event: KeyboardEvent) => void;
  onWindowBlur: () => void;
}) {
  const loadedModule = await import('$lib/utils/luaScriptMonaco');
  const loadedMonaco = await loadedModule.loadMonaco();

  const editor = loadedMonaco.editor.create(input.host, buildScriptEditorMonacoOptions());
  const callHighlightDecorations = editor.createDecorationsCollection();
  const disposables = [
    editor.onDidChangeModelContent(input.onDidChangeModelContent),
    editor.onDidChangeCursorPosition(input.onDidChangeCursorPosition),
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
      themeObserver.disconnect();
      window.removeEventListener('keydown', input.onWindowKeydown);
      window.removeEventListener('keyup', input.onWindowKeyup);
      window.removeEventListener('blur', input.onWindowBlur);
      callHighlightDecorations.clear();
      editor.dispose();
    },
  } satisfies ScriptMonacoRuntime;
}
