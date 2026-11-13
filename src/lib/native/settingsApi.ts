export {
  clearCustomCoverImage,
  connectAiProvider,
  hasConfiguredSecretKey,
  loadAppSettings,
  saveAppSettings,
  setCustomCoverImage,
} from '#lib/stores/appSettings.svelte.ts';

import { host } from '#lib/platform/host/index.ts';

export function loadSecretKey() {
  return host.settings.loadSecretKey();
}
