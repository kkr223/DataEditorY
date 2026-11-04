import type { SettingsFormState } from '#lib/features/settings/controller.ts';

export type SettingsWorkbenchContext = {
  form: SettingsFormState;
  t(key: string, options?: Record<string, unknown>): string;
};
