import { test, expect } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const LIB_ROOT = new URL('../', import.meta.url).pathname.replace(/^\/([a-zA-Z]:)/, '$1');
const ALLOWED_PREFIX = join(LIB_ROOT, 'infrastructure', 'tauri');

function collectFiles(dir: string, out: string[] = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      collectFiles(path, out);
    } else if (path.endsWith('.ts') || path.endsWith('.svelte')) {
      out.push(path);
    }
  }
  return out;
}

test('only the Tauri infrastructure imports @tauri-apps', () => {
  const offenders = collectFiles(join(LIB_ROOT, '..'))
    .filter((path) => !path.startsWith(ALLOWED_PREFIX))
    .filter((path) => /^\s*import[^\n]*from '@tauri-apps\//m.test(readFileSync(path, 'utf8')))
    .map((path) => path.replace(join(LIB_ROOT, '..'), 'src'));
  expect(offenders).toEqual([]);
});
