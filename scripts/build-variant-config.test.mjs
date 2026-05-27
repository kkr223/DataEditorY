import { describe, expect, test } from 'bun:test';

import { createTauriVariantConfig } from './build-variant-config.mjs';

const baseConfig = {
  app: {
    windows: [
      {
        title: 'DataEditorY',
      },
    ],
  },
  bundle: {
    resources: {},
  },
};

describe('build variant config', () => {
  test('extra variant bundles renderer resources from src-tauri resources', () => {
    const config = createTauriVariantConfig(baseConfig, 'extra');
    const resourceKeys = Object.keys(config.bundle.resources);

    expect(config.bundle.resources['resources/yugioh_bundle.bin']).toBe('resources/yugioh_bundle.bin');
    expect(resourceKeys.some((key) => key.includes('ygo-card-renderer-rs'))).toBe(false);
  });
});
