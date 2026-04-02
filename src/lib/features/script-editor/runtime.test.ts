import { describe, expect, test } from 'bun:test';
import { buildScriptEditorMonacoOptions } from '$lib/features/script-editor/runtime';

describe('script editor runtime helpers', () => {
  test('builds stable monaco editor options for the script workspace', () => {
    const options = buildScriptEditorMonacoOptions();

    expect(options.automaticLayout).toBe(true);
    expect(options.language).toBe('lua');
    expect(options.wordWrap).toBe('on');
    expect(options.hover.above).toBe(true);
    expect(options.minimap.enabled).toBe(false);
  });
});
