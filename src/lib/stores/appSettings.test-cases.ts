import * as bunTest from 'bun:test';
import { createServer } from 'node:http';

const { test, expect } = bunTest;
const mock = (bunTest as unknown as {
  mock: { module: (specifier: string, factory: () => unknown) => void };
}).mock;
// Store state is synchronous in this isolated transport test.
Object.assign(globalThis, { $state: <T>(value: T) => value });
let storedKey: string | null = null;
let savedSettings: Record<string, unknown> = {};
mock.module('#lib/infrastructure/tauri/index.ts', () => ({
  tauriBridge: { isTauri: () => false },
  invokeCommand: async (command: string, args?: Record<string, unknown>) => {
    if (command === 'load_secret_key') return storedKey;
    if (command === 'save_app_settings') {
      const request = args?.request as Record<string, unknown>;
      if (request.clearSecretKey) storedKey = null;
      if (typeof request.secretKey === 'string' && request.secretKey.trim()) storedKey = request.secretKey.trim();
      savedSettings = { ...savedSettings, ...request, hasSecretKey: Boolean(storedKey) };
    }
    return { ...savedSettings };
  },
}));
mock.module('#lib/stores/editor.svelte.ts', () => ({ getSelectedCards: () => [] }));
mock.module('#lib/native/assetApi.ts', () => ({
  readTextFile: async () => '', writeTextFile: async () => {}, pathExists: async () => false,
}));
mock.module('#lib/native/scriptApi.ts', () => ({ getCardScriptInfo: async () => ({ exists: false, path: null }) }));
mock.module('#lib/platform/appRuntime.ts', () => ({ documentRuntime: { snapshot: { documents: [] } } }));
mock.module('#lib/modules/card/index.ts', () => ({ CARD_COLLECTION_TYPE: 'cards' }));
mock.module('#lib/modules/card/workbench/workspaceMetadataState.svelte.ts', () => ({ getCardImageDocumentForPath: () => null }));
mock.module('#lib/stores/scriptEditor.svelte.ts', () => ({ getOpenScriptTab: () => null, getScriptTabsForCdb: () => [] }));
const settings = await import('./appSettings.svelte');
const { createAiAppContext } = await import('#lib/features/ai/context.ts');
const { runWorkspaceAgent } = await import('#lib/features/ai/service.ts');
savedSettings = { ...settings.appSettingsState.values };

test('model discovery and chat support unauthenticated local providers and saved API keys', async () => {
  let expectedAuthorization: string | undefined;
  const requests: Array<{ path: string; authorization: string | undefined }> = [];
  const server = createServer((request, response) => {
    requests.push({ path: request.url ?? '', authorization: request.headers.authorization });
    response.setHeader('Content-Type', 'application/json');
    if (request.headers.authorization !== expectedAuthorization) {
      response.writeHead(401);
      response.end(JSON.stringify({ error: { message: 'Invalid API Key' } }));
      return;
    }
    response.end(JSON.stringify(request.url === '/v1/models'
      ? { data: [{ id: 'local-model' }] }
      : { choices: [{ message: { content: 'Done' } }] }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a local TCP listener');
  const apiBaseUrl = `http://127.0.0.1:${address.port}/v1`;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((url, init) => {
    const path = String(url);
    if (path.startsWith('/resources/')) {
      return Promise.resolve(path.endsWith('.json') ? Response.json([]) : new Response('Stable system rule'));
    }
    return originalFetch(url, init);
  }) as typeof fetch;
  try {
    for (const key of [null, ' saved-provider-key ']) {
      storedKey = key;
      expectedAuthorization = key ? `Bearer ${key.trim()}` : undefined;
      const result = await settings.connectAiProvider({ apiBaseUrl, scriptTemplate: '-- test' });
      expect(result.selectedModel).toBe('local-model');
      expect(settings.appSettingsState.values.apiBaseUrl).toBe(apiBaseUrl);
      expect(settings.appSettingsState.values.hasSecretKey).toBe(Boolean(key));
      const context = createAiAppContext();
      const config = await context.getAiConfig();
      expect(config.secretKey).toBe(key?.trim() ?? '');
      const answer = await runWorkspaceAgent({ threadId: 'test', instruction: 'Say done', context });
      expect(answer.text).toBe('Done');
    }
    expect(requests).toEqual([
      { path: '/v1/models', authorization: undefined },
      { path: '/v1/chat/completions', authorization: undefined },
      { path: '/v1/models', authorization: 'Bearer saved-provider-key' },
      { path: '/v1/chat/completions', authorization: 'Bearer saved-provider-key' },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
