import { existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(__dirname, '..');

const rendererRepoUrl = process.env.RENDERER_REPO_URL
  ?? 'https://github.com/kkr223/ygo-card-renderer-rs.git';
const cdbRepoUrl = process.env.YGOPRO_CDB_REPO_URL
  ?? 'https://github.com/kkr223/ygopro-cdb-encode-rs.git';
const workDir = resolve(process.env.RENDERER_WORK_DIR ?? join(tmpdir(), 'dataeditory-renderer-deps'));
const rendererDir = resolve(process.env.RENDERER_REPO_DIR ?? join(workDir, 'ygo-card-renderer-rs'));
const cdbDir = resolve(dirname(rendererDir), 'ygopro-cdb-encode-rs');
const outputPath = resolve(
  workspaceRoot,
  process.argv[2] ?? 'src-tauri/resources/yugioh_bundle.bin',
);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(' ')}`);
  }
}

function ensureRepo(path, url) {
  if (existsSync(path)) {
    run('git', ['-C', path, 'pull', '--ff-only']);
    return;
  }

  mkdirSync(dirname(path), { recursive: true });
  run('git', ['clone', '--depth', '1', url, path]);
}

mkdirSync(dirname(outputPath), { recursive: true });
ensureRepo(rendererDir, rendererRepoUrl);
ensureRepo(cdbDir, cdbRepoUrl);
run('cargo', [
  'run',
  '--manifest-path',
  resolve(rendererDir, 'Cargo.toml'),
  '--bin',
  'build_bundle',
  '--',
  '--out',
  outputPath,
]);

process.stdout.write(`${outputPath}\n`);
