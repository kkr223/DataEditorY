export {
  clearCustomCoverImage,
  connectAiProvider,
  hasConfiguredSecretKey,
  loadAppSettings,
  saveAppSettings,
  setCustomCoverImage,
} from '#lib/stores/appSettings.svelte.ts';

import { invokeCommand } from '#lib/infrastructure/tauri/index.ts';

export function loadSecretKey() {
  return invokeCommand<string | null>('load_secret_key');
}
