import { test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('runtime Lua resource overrides reach catalog consumers', () => {
  // Keep native resource mocks isolated from other editor tests.
  execFileSync(process.execPath, ['test', fileURLToPath(new URL('./catalogResources.test-cases.ts', import.meta.url))], {
    timeout: 10000,
    stdio: 'pipe',
  });
}, 15000);
