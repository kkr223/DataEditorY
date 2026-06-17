import type { SettingsFormState } from '$lib/features/settings/controller';

export type SettingsWorkbenchContext = {
  form: SettingsFormState;
  t(key: string, options?: Record<string, unknown>): string;
};
