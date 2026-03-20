import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const workspaceRoot = resolve(__dirname, '..');
const packageJsonPath = resolve(workspaceRoot, 'package.json');

const BUILD_VARIANTS = {
  base: {
    key: 'base',
    label: 'Base',
    productName: 'DataEditorY Base',
    identifier: 'com.kkr223.dataeditory.base',
    windowTitle: 'DataEditorY Base',
    features: {
      cardImage: false,
      ai: false,
    },
  },
  extra: {
    key: 'extra',
    label: 'Extra',
    productName: 'DataEditorY Extra',
    identifier: 'com.kkr223.dataeditory.extra',
    windowTitle: 'DataEditorY Extra',
    features: {
      cardImage: true,
      ai: true,
    },
  },
};

const REQUIRED_BUNDLE_RESOURCES = {
  '../static/resources/strings.conf': 'resources/strings.conf',
  '../static/resources/cover.jpg': 'resources/cover.jpg',
};

const CARD_IMAGE_BUNDLE_RESOURCE = {
  '../static/resources/yugioh-card': 'resources/yugioh-card',
};

export function getPackageVersion() {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  return String(packageJson.version ?? '').trim();
}

export function normalizeBuildVariant(rawVariant = process.env.APP_VARIANT) {
  const normalized = String(rawVariant ?? 'extra').trim().toLowerCase();
  return normalized === 'base' ? 'base' : 'extra';
}

export function getBuildVariantConfig(rawVariant = process.env.APP_VARIANT) {
  return BUILD_VARIANTS[normalizeBuildVariant(rawVariant)];
}

/**
 * @param {Record<string, any>} baseConfig
 * @param {string | undefined} [rawVariant]
 */
export function createTauriVariantConfig(baseConfig, rawVariant = process.env.APP_VARIANT) {
  const variant = getBuildVariantConfig(rawVariant);
  const windows = /** @type {Array<Record<string, any>> | undefined} */ (baseConfig.app?.windows);
  const resources = {
    ...(baseConfig.bundle?.resources ?? {}),
    ...REQUIRED_BUNDLE_RESOURCES,
  };

  if (variant.features.cardImage) {
    Object.assign(resources, CARD_IMAGE_BUNDLE_RESOURCE);
  } else {
    delete resources['../static/resources/yugioh-card'];
  }

  return {
    ...baseConfig,
    productName: variant.productName,
    version: getPackageVersion(),
    identifier: variant.identifier,
    app: {
      ...baseConfig.app,
      windows: Array.isArray(windows)
        ? windows.map((windowConfig, index) => (
            index === 0
              ? {
                  ...windowConfig,
                  title: variant.windowTitle,
                }
              : windowConfig
          ))
        : baseConfig.app?.windows,
    },
    bundle: {
      ...baseConfig.bundle,
      resources,
    },
  };
}
