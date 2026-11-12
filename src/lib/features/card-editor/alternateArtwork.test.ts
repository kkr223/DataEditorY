import { test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('alternate artwork shortcut regressions', () => {
  execFileSync(process.execPath, ['test', fileURLToPath(new URL('./alternateArtwork.test-cases.ts', import.meta.url))], {
    timeout: 10000,
    stdio: 'pipe',
  });
}, 15000);
