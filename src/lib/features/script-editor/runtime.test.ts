import { describe, expect, test } from 'bun:test';
import type { editor as MonacoEditor } from 'monaco-editor';
import {
  attachSnippetTabNavigation,
  buildScriptEditorMonacoOptions,
  type ScriptMonacoApi,
} from '$lib/features/script-editor/runtime';

describe('script editor runtime helpers', () => {
  test('builds stable monaco editor options for the script workspace', () => {
    const options = buildScriptEditorMonacoOptions();

    expect(options.automaticLayout).toBe(true);
    expect(options.language).toBe('lua');
    expect(options.wordWrap).toBe('on');
    expect(options.hover.above).toBe(true);
    expect(options.minimap.enabled).toBe(false);
  });

  test('prioritizes snippet placeholder navigation on tab', () => {
    const actions: MonacoEditor.IActionDescriptor[] = [];
    const triggered: string[] = [];
    const editor = {
      addAction(action: MonacoEditor.IActionDescriptor) {
        actions.push(action);
        return { dispose() {} };
      },
    } as unknown as MonacoEditor.IStandaloneCodeEditor;
    const monaco = {
      KeyCode: { Tab: 2 },
      KeyMod: { Shift: 1024 },
    } as unknown as ScriptMonacoApi;

    attachSnippetTabNavigation(editor, monaco);
    expect(actions.map((action) => action.precondition)).toEqual([
      'inSnippetMode && hasNextTabstop',
      'inSnippetMode && hasPrevTabstop',
    ]);

    actions[0].run({
      trigger: (_source: string, command: string) => triggered.push(command),
    } as unknown as MonacoEditor.ICodeEditor);
    expect(triggered).toEqual(['jumpToNextSnippetPlaceholder']);
  });
});
