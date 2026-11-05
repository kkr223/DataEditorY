import { test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('AI provider authentication regressions', () => {
  execFileSync(process.execPath, ['test', fileURLToPath(new URL('./appSettings.test-cases.ts', import.meta.url))], {
    timeout: 10000,
    stdio: 'pipe',
  });
}, 15000);
