import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_SCRIPT_SNIPPETS, getConfiguredScriptSnippets, getScriptSnippetIssue,
  readScriptSnippetEntries, serializeScriptSnippetEntries,
} from './snippetPreferences';

describe('user Lua snippets', () => {
  test('accepts legacy resources and preserves snippet syntax through editing', () => {
    expect(getScriptSnippetIssue(DEFAULT_SCRIPT_SNIPPETS)).toBeNull();
    const entries = readScriptSnippetEntries(DEFAULT_SCRIPT_SNIPPETS);
    expect(entries.length > 0).toBe(true);
    const text = '{"mine":{"prefix":"#mine","body":"function ${1:example}()\\n\\t$0\\nend","description":"My hint"}}';
    const restored = readScriptSnippetEntries(serializeScriptSnippetEntries(readScriptSnippetEntries(text)));
    expect(restored[0].body).toBe('function ${1:example}()\n\t$0\nend');
    expect(restored[0].description).toBe('My hint');
  });

  test('user content replaces bundled custom snippets while keeping built-in snippets', () => {
    const bundled = [
      { name: 'old', prefix: '#old', body: ['old'], description: 'old', sortText: '1001' },
      { name: 'Header', prefix: 'ygo.header', body: ['header'], description: 'header', sortText: '0001' },
    ];
    const custom = '{"mine":{"prefix":"#mine","body":["-- mine $1"],"description":"My hint"}}';
    expect(getConfiguredScriptSnippets(custom, bundled).map((item) => item.prefix)).toEqual(['#mine', 'ygo.header']);
    expect(getConfiguredScriptSnippets('{}', bundled).map((item) => item.prefix)).toEqual(['ygo.header']);
    // Saved changes replace the cache immediately, including deliberately cleared lists.
    expect(getConfiguredScriptSnippets(custom, bundled)[0].description).toBe('My hint');
  });

  test('reports malformed input, blank code, and duplicate triggers before saving', () => {
    expect(getScriptSnippetIssue('broken')).toBe('json');
    expect(getScriptSnippetIssue('[]')).toBe('entry');
    expect(getScriptSnippetIssue('{"a":{"prefix":"#a","body":[1]}}')).toBe('body');
    expect(getScriptSnippetIssue('{"a":{"prefix":"#a","body":""}}')).toBe('body');
    expect(getScriptSnippetIssue('{"a":{"prefix":"#a","body":"a"},"b":{"prefix":"#A","body":"b"}}')).toBe('duplicate');
    expect(getScriptSnippetIssue('{"a":{"prefix":"two words","body":"a"}}')).toBe('prefix');
    expect(getScriptSnippetIssue('{}')).toBeNull();
  });
});
