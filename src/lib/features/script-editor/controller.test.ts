import { describe, expect, test } from 'bun:test';
import {
  buildCallHighlightDecorations,
  buildScriptEditorContextKey,
  normalizeScriptCardContext,
  resolveHintAnchor,
  resolveHoverAbove,
} from '$lib/features/script-editor/controller';

describe('script editor controller helpers', () => {
  test('normalizes card context into persistable data', () => {
    const result = normalizeScriptCardContext({
      code: 1000,
      alias: 0,
      setcode: [1, 2],
      type: 1,
      attack: 3000,
      defense: 2500,
      level: 8,
      race: 1,
      attribute: 1,
      category: 0,
      ot: 0,
      name: 'Blue-Eyes',
      desc: 'Legendary dragon',
      strings: Array.from({ length: 16 }, () => ''),
      lscale: 0,
      rscale: 0,
      linkMarker: 0,
      ruleCode: 0,
    });

    expect(result?.code).toBe(1000);
    expect(result?.setcode).toEqual([1, 2]);
    expect(result !== null).toBe(true);
  });

  test('builds a stable context key for the active script workspace', () => {
    expect(buildScriptEditorContextKey({
      activeScriptTab: {
        id: 'script-1',
        cdbPath: 'D:/cards/main.cdb',
        sourceTabId: 'db-1',
        cardCode: 1000,
        cardName: 'Blue-Eyes',
        scriptPath: 'D:/cards/script/c1000.lua',
        content: '',
        savedContent: '',
        isDirty: false,
        viewState: null,
        createdFromTemplate: false,
      },
      dbTabs: [{ id: 'db-1', path: 'D:/cards/main.cdb' }],
    })).toBe('script-1::D:/cards/main.cdb::1000::db-1::db-1:D:/cards/main.cdb');
  });

  test('resolves hint anchor placement from visible editor coordinates', () => {
    expect(resolveHintAnchor({
      hostOffsetTop: 20,
      visibleTop: 10,
      visibleHeight: 20,
    })).toEqual({
      top: 51,
      placement: 'bottom',
    });

    expect(resolveHintAnchor({
      hostOffsetTop: 20,
      visibleTop: 200,
      visibleHeight: 20,
    })).toEqual({
      top: 221,
      placement: 'top',
    });
  });

  test('resolves hover placement based on cursor vertical position', () => {
    expect(resolveHoverAbove({
      visibleTop: 120,
      visibleHeight: 20,
      previous: false,
    })).toBe(true);

    expect(resolveHoverAbove({
      visibleTop: 40,
      visibleHeight: 20,
      previous: true,
    })).toBe(false);
  });

  test('builds cached call highlight decorations', () => {
    const result = buildCallHighlightDecorations(
      'Duel.LoadScript("foo")',
      '',
      [],
      () => [
        {
          startLineNumber: 1,
          startColumn: 6,
          endLineNumber: 1,
          endColumn: 16,
        },
      ],
    );

    expect(result.source).toBe('Duel.LoadScript("foo")');
    expect(result.decorations).toEqual([
      {
        range: {
          startLineNumber: 1,
          startColumn: 6,
          endLineNumber: 1,
          endColumn: 16,
        },
        options: {
          inlineClassName: 'lua-call-highlight',
        },
      },
    ]);
  });
});
