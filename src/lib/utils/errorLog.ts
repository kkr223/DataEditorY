import { invoke } from '@tauri-apps/api/core';

type ErrorLogInput = {
  source: string;
  error: unknown;
  extra?: Record<string, unknown> | string;
};

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack ?? '',
    };
  }

  if (typeof error === 'string') {
    return {
      message: error,
      stack: '',
    };
  }

  try {
    return {
      message: JSON.stringify(error),
      stack: '',
    };
  } catch {
    return {
      message: String(error),
      stack: '',
    };
  }
}

function normalizeExtra(extra?: Record<string, unknown> | string) {
  if (!extra) return undefined;
  if (typeof extra === 'string') return extra;

  try {
    return JSON.stringify(extra);
  } catch {
    return String(extra);
  }
}

export async function writeErrorLog(input: ErrorLogInput) {
  const normalized = normalizeError(input.error);
  try {
    return await invoke<string>('append_error_log', {
      request: {
        source: input.source,
        message: normalized.message,
        stack: normalized.stack,
        extra: normalizeExtra(input.extra),
      },
    });
  } catch (logError) {
    console.error('[DataEditorY] Failed to write local error log', logError);
    return null;
  }
}
