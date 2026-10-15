import { describe, expect, test } from 'bun:test';
import type { editor as MonacoEditor } from 'monaco-editor';
import {
  attachSnippetTabNavigation,
  attachFontZoomActions,
  buildScriptEditorMonacoOptions,
  type ScriptMonacoApi,
} from '$lib/features/script-editor/runtime';
import { normalizeScriptEditorFontSize } from './fontPreferences';

describe('script editor runtime helpers', () => {
  test('builds stable monaco editor options for the script workspace', () => {
    const options = buildScriptEditorMonacoOptions();

    expect(options.automaticLayout).toBe(true);
    expect(options.language).toBe('lua');
    expect(options.wordWrap).toBe('on');
    expect(options.hover.above).toBe(true);
    expect(options.hover.delay).toBe(0);
    expect(options.minimap.enabled).toBe(false);
    expect(options.fontSize).toBe(14);
    expect(options.lineHeight).toBe(22 / 14);
    expect(buildScriptEditorMonacoOptions(20).fontSize).toBe(20);
  });

  test('normalizes legacy and out-of-range font preferences', () => {
    expect(normalizeScriptEditorFontSize(undefined)).toBe(14);
    expect(normalizeScriptEditorFontSize(Number.NaN)).toBe(14);
    expect(normalizeScriptEditorFontSize(7)).toBe(8);
    expect(normalizeScriptEditorFontSize(40)).toBe(32);
    expect(normalizeScriptEditorFontSize(18.6)).toBe(19);
  });

  test('shares wheel and keyboard zoom, resets to the latest default and removes listeners', () => {
    let fontSize = 14;
    let defaultFontSize = 14;
    let wheel: ((event: WheelEvent) => void) | null = null;
    let disposed = 0;
    const actions: MonacoEditor.IActionDescriptor[] = [];
    const editor = {
      getOption: () => fontSize,
      updateOptions: (options: { fontSize: number }) => { fontSize = options.fontSize; },
      addAction: (action: MonacoEditor.IActionDescriptor) => { actions.push(action); return { dispose: () => { disposed++; } }; },
      getContainerDomNode: () => ({
        addEventListener: (_name: string, callback: (event: WheelEvent) => void) => { wheel = callback; },
        removeEventListener: (_name: string, callback: (event: WheelEvent) => void) => { expect(callback).toBe(wheel); wheel = null; },
      }),
    } as unknown as MonacoEditor.IStandaloneCodeEditor;
    const monaco = { KeyCode: {}, KeyMod: {}, editor: { EditorOption: { fontSize: 1 } } } as unknown as ScriptMonacoApi;
    const dispose = attachFontZoomActions(editor, monaco, () => defaultFontSize);
    let prevented = 0;
    const scroll = (ctrlKey: boolean, deltaY: number) => (wheel as unknown as (event: WheelEvent) => void)({
      ctrlKey, metaKey: false, deltaY,
      preventDefault: () => { prevented++; }, stopPropagation() {},
    } as WheelEvent);
    scroll(false, -120);
    expect(fontSize).toBe(14);
    expect(prevented).toBe(0);
    scroll(true, -120);
    expect(fontSize).toBe(15);
    actions[1].run(editor);
    expect(fontSize).toBe(14);
    fontSize = 32;
    scroll(true, -120);
    expect(fontSize).toBe(32);
    fontSize = 8;
    scroll(true, 120);
    expect(fontSize).toBe(8);
    defaultFontSize = 20;
    actions[2].run(editor);
    expect(fontSize).toBe(20);
    expect(prevented).toBe(3);
    dispose();
    expect(disposed).toBe(3);
    expect(wheel).toBeNull();
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
