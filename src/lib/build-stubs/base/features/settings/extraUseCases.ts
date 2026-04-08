import type { AppSettingsPayload } from "$lib/stores/appSettings.svelte";
import type { SettingsFormState } from "$lib/features/settings/controller";

type Translate = (key: string, options?: Record<string, unknown>) => string;

export async function connectSettingsAiFlow(_input: {
  form: SettingsFormState;
  hasAiCapability: boolean;
  t: Translate;
}) {
  return false;
}

export async function saveSelectedModelFlow(_input: {
  form: SettingsFormState;
  hasAiCapability: boolean;
  t: Translate;
}) {
  return false;
}

export async function clearSecretKeyFlow(_input: {
  form: SettingsFormState;
  hasAiCapability: boolean;
  t: Translate;
}) {
  return false;
}

export async function autoConnectSettingsFlow(_input: {
  values: AppSettingsPayload;
  hasAiCapability: boolean;
  setModel: (model: string) => void;
}) {
  return false;
}

export function getSettingsConnectionHint(t: Translate) {
  return t("settings.connect_hint");
}
