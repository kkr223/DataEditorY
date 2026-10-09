import { describe, expect, test } from 'bun:test';
import { AI_TOOL_NAMES, normalizeAiCardPatch, READONLY_PROPOSAL_TOOL_NAMES, runWorkspaceAgent, type AiAppContext } from './service';

describe('AI workspace service boundaries', () => {
  test('proposal runner only exposes read-only tools', () => {
    const tools: string[] = [...READONLY_PROPOSAL_TOOL_NAMES];
    expect(tools.includes('search_cards')).toBe(true);
    expect(tools.includes('read_card_script')).toBe(true);
    expect(tools.includes('apply_batch_card_edit')).toBe(false);
  });

  test('does not expose script test tools', () => {
    const tools: string[] = [...AI_TOOL_NAMES];
    expect(tools.includes('get_script_test_context')).toBe(false);
    expect(tools.includes('propose_script_test_plan')).toBe(false);
  });

  test('normalizes AI card patches to real card fields', () => {
    expect(normalizeAiCardPatch({
      atk: '2500',
      def: '?',
      name: 'Test',
      code: 123,
      unknown: true,
      setcode: ['452', 'bad', 4660],
    })).toEqual({
      attack: 2500,
      defense: -2,
      name: 'Test',
      setcode: [452, 4660],
    });
  });

  test('keeps DeepSeek conversation prefix stable and sends skill rules with the current turn', async () => {
    const originalFetch = globalThis.fetch;
    const requests: Array<{ messages: Array<{ role: string; content: string }> }> = [];
    globalThis.fetch = (async (url, init) => {
      const path = String(url);
      if (path.endsWith('/ai-skills/manifest.json')) return Response.json(['batch_card_edit.md']);
      if (path.endsWith('/ai-skills/batch_card_edit.md')) return new Response('---\nname: batch_card_edit\ntools:\n  - search_cards\n---\nBatch rule');
      if (path.endsWith('/ai-prompts/system-prompt.md')) return new Response('Stable system rule');
      requests.push(JSON.parse(String(init?.body)));
      return Response.json({ choices: [{ message: { content: 'Done' } }], usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 } });
    }) as typeof fetch;
    try {
      const context: AiAppContext = {
        getAiConfig: async () => ({ apiBaseUrl: 'https://api.deepseek.com', model: 'deepseek-chat', temperature: 0, maxSteps: 2, secretKey: 'test' }),
        listOpenDatabases: () => [],
        getActiveDatabaseId: () => null,
        queryCards: async <T>() => null as T,
        getSelectedCardsInActiveTab: () => [],
        readCardScript: async () => ({ exists: false, path: null, content: null }),
        readImageConfig: () => null,
        resolveScriptPath: async () => '',
        resolveScriptTestPath: async () => '',
      };
      await runWorkspaceAgent({ threadId: 't', instruction: '@batch_card_edit first', context });
      await runWorkspaceAgent({ threadId: 't', instruction: 'second', history: [
        { id: '1', role: 'user', content: 'first', createdAt: 1 },
        { id: '2', role: 'assistant', content: 'Done', createdAt: 2 },
      ], context });
      await runWorkspaceAgent({ threadId: 't', instruction: 'third', history: [
        { id: '1', role: 'user', content: 'first', createdAt: 1 },
        { id: '2', role: 'assistant', content: 'Done', createdAt: 2 },
        { id: '3', role: 'user', content: 'second', createdAt: 3 },
        { id: '4', role: 'assistant', content: 'Done', createdAt: 4 },
      ], context });
      expect(requests[0].messages[0]).toEqual({ role: 'system', content: 'Stable system rule' });
      expect(requests[0].messages[1].content).toContain('Batch rule');
      expect(requests[1].messages.slice(0, 3)).toEqual([
        { role: 'system', content: 'Stable system rule' },
        { role: 'user', content: 'first' },
        { role: 'assistant', content: 'Done' },
      ]);
      expect(requests[2].messages.slice(0, -2)).toEqual(requests[1].messages);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('returns DeepSeek reasoning content during tool calls', async () => {
    const originalFetch = globalThis.fetch;
    const requests: Array<{ messages: Array<Record<string, unknown>>; tool_choice?: string }> = [];
    globalThis.fetch = (async (url, init) => {
      const path = String(url);
      if (path.endsWith('/ai-skills/manifest.json')) return Response.json([]);
      if (path.endsWith('/ai-prompts/system-prompt.md')) return new Response('Stable system rule');
      requests.push(JSON.parse(String(init?.body)));
      return Response.json({ choices: [{ message: requests.length === 1
        ? { content: '', reasoning_content: 'Need database list', tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'list_open_databases', arguments: '{}' } }] }
        : { content: 'Done' } }] });
    }) as typeof fetch;
    try {
      await runWorkspaceAgent({
        threadId: 't', instruction: 'list databases',
        context: {
          getAiConfig: async () => ({ apiBaseUrl: 'https://api.deepseek.com', model: 'deepseek-chat', temperature: 0, maxSteps: 2, secretKey: 'test' }),
          listOpenDatabases: () => [], getActiveDatabaseId: () => null,
          queryCards: async <T>() => null as T,
          getSelectedCardsInActiveTab: () => [],
          readCardScript: async () => ({ exists: false, path: null, content: null }),
          readImageConfig: () => null,
          resolveScriptPath: async () => '', resolveScriptTestPath: async () => '',
        },
      });
      expect(requests[0].tool_choice).toBe(undefined);
      expect(requests[1].messages[2].reasoning_content).toBe('Need database list');
      expect(requests[1].messages[3].role).toBe('tool');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
