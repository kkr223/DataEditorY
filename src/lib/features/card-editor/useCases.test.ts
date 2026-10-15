import { test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('card editor deletion and ID-change regressions', () => {
  // Store mocks must stay isolated from the other store tests in the same Bun process.
  execFileSync(process.execPath, ['test', fileURLToPath(new URL('./useCases.test-cases.ts', import.meta.url))], {
    timeout: 10000,
    stdio: 'pipe',
  });
}, 15000);
