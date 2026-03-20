import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { createTauriVariantConfig, getBuildVariantConfig, workspaceRoot } from './build-variant-config.mjs';

const variant = getBuildVariantConfig(process.argv[2]);
const outputPath = resolve(
  workspaceRoot,
  process.argv[3] ?? `build/variant/tauri.${variant.key}.conf.json`,
);
const tauriConfigPath = resolve(workspaceRoot, 'src-tauri', 'tauri.conf.json');
const baseConfig = JSON.parse(readFileSync(tauriConfigPath, 'utf8'));
const nextConfig = createTauriVariantConfig(baseConfig, variant.key);

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(nextConfig, null, 2)}\n`);

process.stdout.write(outputPath);
