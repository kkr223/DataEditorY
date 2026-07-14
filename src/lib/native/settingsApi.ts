export {
  clearCustomCoverImage,
  connectAiProvider,
  hasConfiguredSecretKey,
  loadAppSettings,
  saveAppSettings,
  setCustomCoverImage,
} from '$lib/stores/appSettings.svelte';

import { invokeCommand } from '$lib/infrastructure/tauri';

export function loadSecretKey() {
  return invokeCommand<string | null>('load_secret_key');
}
