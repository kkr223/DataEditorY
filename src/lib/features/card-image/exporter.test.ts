import { test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('batch export configuration, layers and file protection regressions', () => {
  execFileSync(process.execPath, ['test', fileURLToPath(new URL('./exporter.test-cases.ts', import.meta.url))], {
    timeout: 15000, stdio: 'pipe',
  });
}, 20000);
