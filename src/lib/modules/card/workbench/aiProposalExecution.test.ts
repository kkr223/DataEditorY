import { test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('AI proposal adapters preserve document ownership and live script buffers', () => {
  // Runtime/store mocks must not leak into other Bun tests.
  execFileSync(process.execPath, ['test', fileURLToPath(new URL('./aiProposalExecution.test-cases.ts', import.meta.url))], {
    timeout: 10000,
    stdio: 'pipe',
  });
}, 15000);
