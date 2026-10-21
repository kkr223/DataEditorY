import { test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('text tab save, reload and resource lifetime regressions', () => {
  // Store mocks must not replace modules used by other suites in Bun's shared process.
  execFileSync(process.execPath, ['test', fileURLToPath(new URL('./textEditor.test-cases.ts', import.meta.url))], {
    timeout: 10000,
    stdio: 'pipe',
  });
}, 15000);
