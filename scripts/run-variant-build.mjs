import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

import { createTauriVariantConfig, getBuildVariantConfig, workspaceRoot } from './build-variant-config.mjs';

function run(command, args, env = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        ...env,
      },
      stdio: 'inherit',
      shell: false,
    });

    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      rejectPromise(new Error(`${command} ${args.join(' ')} failed with code ${code ?? 'null'} and signal ${signal ?? 'null'}`));
    });
    child.on('error', rejectPromise);
  });
}

function buildVariantTauriConfig(rawVariant, baseConfigText) {
  const variant = getBuildVariantConfig(rawVariant);
  const baseConfig = JSON.parse(baseConfigText);
  return `${JSON.stringify(createTauriVariantConfig(baseConfig, variant.key), null, 2)}\n`;
}

async function runFrontendBuild(rawVariant) {
  const variant = getBuildVariantConfig(rawVariant);
  await run('bun', ['run', 'build:web:raw'], { APP_VARIANT: variant.key });
}

async function runFrontendDev(rawVariant) {
  const variant = getBuildVariantConfig(rawVariant);
  await run('bun', ['run', 'dev:raw'], { APP_VARIANT: variant.key });
}

async function runTauriCommand(command, rawVariant, passthroughArgs) {
  const variant = getBuildVariantConfig(rawVariant);
  const tauriConfigPath = resolve(workspaceRoot, 'src-tauri', 'tauri.conf.json');
  const originalConfigText = readFileSync(tauriConfigPath, 'utf8');
  const variantConfigText = buildVariantTauriConfig(variant.key, originalConfigText);
  const profile = command === 'build' ? 'release' : 'debug';
  const targetRoot = resolve(workspaceRoot, 'src-tauri', 'target', profile);
  const resourcesDir = resolve(targetRoot, 'resources');
  const wixDir = resolve(targetRoot, 'wix');

  try {
    writeFileSync(tauriConfigPath, variantConfigText);
    rmSync(resourcesDir, { recursive: true, force: true });
    rmSync(wixDir, { recursive: true, force: true });
    await run(
      'bun',
      ['x', 'tauri', command, ...passthroughArgs],
      { APP_VARIANT: variant.key },
    );
  } finally {
    writeFileSync(tauriConfigPath, originalConfigText);
  }
}

async function main() {
  const mode = process.argv[2] ?? 'frontend';

  if (mode === 'frontend') {
    await runFrontendBuild(process.argv[3]);
    return;
  }

  if (mode === 'dev-frontend') {
    await runFrontendDev(process.argv[3]);
    return;
  }

  if (mode === 'tauri') {
    const command = process.argv[3] ?? 'build';
    const candidateVariant = process.argv[4];
    const variant = candidateVariant && !candidateVariant.startsWith('-')
      ? candidateVariant
      : undefined;
    const passthroughArgs = variant ? process.argv.slice(5) : process.argv.slice(4);
    await runTauriCommand(command, variant, passthroughArgs);
    return;
  }

  if (mode === 'build-all') {
    await runTauriCommand('build', 'base', []);
    await runTauriCommand('build', 'extra', []);
    return;
  }

  throw new Error(`Unsupported mode: ${mode}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
