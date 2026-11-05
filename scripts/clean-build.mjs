import { existsSync, lstatSync, realpathSync, rmSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const workspace = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const positional = args.filter((arg) => !arg.startsWith('--'));
const mode = positional[0] ?? 'all';
if (positional.length > 1 || !['all', 'frontend', 'rust'].includes(mode) || args.some((arg) => arg.startsWith('--') && arg !== '--dry-run')) {
  throw new Error('Usage: node scripts/clean-build.mjs [all|frontend|rust] [--dry-run]');
}

const checkedPath = (name) => {
  const target = resolve(workspace, name);
  if (!existsSync(target)) return null;
  const actual = realpathSync(target);
  const within = relative(workspace, actual);
  if (!within || isAbsolute(within) || within === '..' || within.startsWith(`..${sep}`) || lstatSync(target).isSymbolicLink()) {
    throw new Error(`Refusing to clean a linked path or a path outside this project: ${target}`);
  }
  return target;
};

// Validate every deletion before removing anything. Source assets, installed packages,
// CDB working copies in app data, and exported files under dist/ are outside this list.
const frontend = mode === 'rust' ? [] : ['.svelte-kit', 'build', 'node_modules/.vite'].map(checkedPath).filter(Boolean);
const rust = mode === 'frontend' ? null : checkedPath('src-tauri/target');
for (const target of [...frontend, ...(rust ? [rust] : [])]) console.log(`${dryRun ? 'Would remove' : 'Cleaning'} ${target}`);
if (!dryRun) {
  if (rust) {
    const result = spawnSync('cargo', ['clean', '--manifest-path', resolve(workspace, 'src-tauri/Cargo.toml'), '--target-dir', rust], { stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
  for (const target of frontend) rmSync(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 150 });
}
