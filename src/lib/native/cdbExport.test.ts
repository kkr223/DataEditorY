import { test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('web filtered CDB export and failure cleanup', () => {
  execFileSync(process.execPath, ['test', fileURLToPath(new URL('./cdbExport.test-cases.ts', import.meta.url))], {
    timeout: 10000,
    stdio: 'pipe',
  });
}, 15000);
