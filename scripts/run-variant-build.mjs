import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
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

// The module entry is selected by the Vite `dey-variant-modules` plugin from
// APP_VARIANT, and Tauri receives a generated `--config` override, so no
// tracked file is rewritten (interrupted or concurrent runs stay clean).

async function runFrontendBuild(rawVariant) {
  const variant = getBuildVariantConfig(rawVariant);
  await run('bun', ['run', 'build:web:raw'], {
    APP_VARIANT: variant.key,
    DATAEDITORY_WEB_BUILD: '1',
  });
}

async function runFrontendDev(rawVariant) {
  const variant = getBuildVariantConfig(rawVariant);
  await run('bun', ['run', 'dev:raw'], { APP_VARIANT: variant.key });
}

async function runFrontendCheck(rawVariant) {
  const variant = getBuildVariantConfig(rawVariant);
  // Type checking is variant-independent: extra.ts re-exports every base
  // module, so one pass covers both variants. Only bundling uses the variant
  // entry resolved by the Vite plugin.
  await run('bun', ['run', 'check'], { APP_VARIANT: variant.key });
}

function writeTauriVariantOverride(variantKey) {
  const tauriConfigPath = resolve(workspaceRoot, 'src-tauri', 'tauri.conf.json');
  const baseConfig = JSON.parse(readFileSync(tauriConfigPath, 'utf8'));
  const variantConfig = createTauriVariantConfig(baseConfig, variantKey);
  // Tauri merges --config as a JSON merge patch; null removes inherited keys.
  const resources = { ...variantConfig.bundle.resources };
  for (const key of Object.keys(baseConfig.bundle?.resources ?? {})) {
    if (!(key in resources)) resources[key] = null;
  }
  const override = { ...variantConfig, bundle: { ...variantConfig.bundle, resources } };
  const outputPath = resolve(workspaceRoot, 'build', 'variant', `tauri.${variantKey}.override.json`);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(override, null, 2)}\n`);
  return outputPath;
}

async function runTauriCommand(command, rawVariant, passthroughArgs) {
  const variant = getBuildVariantConfig(rawVariant);
  const overridePath = writeTauriVariantOverride(variant.key);
  const profile = command === 'build' ? 'release' : 'debug';
  const targetRoot = resolve(workspaceRoot, 'src-tauri', 'target', profile);
  rmSync(resolve(targetRoot, 'resources'), { recursive: true, force: true });
  rmSync(resolve(targetRoot, 'wix'), { recursive: true, force: true });
  await run(
    'bun',
    ['x', 'tauri', command, '--config', overridePath, ...passthroughArgs],
    { APP_VARIANT: variant.key },
  );
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

  if (mode === 'check') {
    await runFrontendCheck(process.argv[3]);
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
