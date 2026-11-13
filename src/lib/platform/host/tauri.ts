import { invokeCommand, tauriBridge } from '#lib/infrastructure/tauri/index.ts';
import type {
  HostAdapter,
  HostDragPayload,
  HostEventMap,
  HostEventName,
  HostOpenOptions,
  HostSaveOptions,
} from './types.ts';

const TAURI_EVENT_NAMES: Record<HostEventName, string> = {
  'open-cdb-paths': 'open-cdb-paths',
  'file-drop': tauriBridge.TauriEvent.DRAG_DROP,
  'file-drag-enter': tauriBridge.TauriEvent.DRAG_ENTER,
  'file-drag-leave': tauriBridge.TauriEvent.DRAG_LEAVE,
  'background-task-progress': 'background-task-progress',
};

function dragPayload(payload: unknown): HostDragPayload {
  if (!payload || typeof payload !== 'object') return { paths: [] };
  const paths = (payload as { paths?: unknown }).paths;
  return { paths: Array.isArray(paths) ? paths.map(String) : [] };
}

/** Desktop host backed by Tauri plugins. */
export const tauriHost: HostAdapter = {
  kind: 'tauri',
  capabilities: {
    revealInFileManager: true,
    openExternalEditor: true,
    writeBackToSource: true,
    directoryPicker: true,
    fileAssociations: true,
    nativeWindow: true,
  },

  dialogs: {
    open: (options?: HostOpenOptions) => tauriBridge.open({
      multiple: options?.multiple,
      directory: options?.directory,
      defaultPath: options?.defaultPath,
      filters: options?.filters,
    }),
    save: (options?: HostSaveOptions) => tauriBridge.save({
      defaultPath: options?.defaultPath,
      filters: options?.filters,
    }),
    confirm: (message, options) => tauriBridge.ask(message, {
      title: options?.title,
      kind: options?.kind,
    }),
    message: async (message, options) => {
      await tauriBridge.message(message, {
        title: options?.title,
        kind: options?.kind,
      });
    },
  },

  events: {
    listen: async <K extends HostEventName>(
      name: K,
      handler: (payload: HostEventMap[K]) => void,
    ) => {
      const unlisten = await tauriBridge.listen<unknown>(TAURI_EVENT_NAMES[name], (event) => {
        if (name === 'open-cdb-paths') {
          handler((Array.isArray(event.payload) ? event.payload : []) as HostEventMap[K]);
          return;
        }
        if (name === 'background-task-progress') {
          handler(event.payload as HostEventMap[K]);
          return;
        }
        if (name === 'file-drag-leave') {
          handler(undefined as HostEventMap[K]);
          return;
        }
        handler(dragPayload(event.payload) as HostEventMap[K]);
      });
      return unlisten;
    },
  },

  window: {
    title: () => tauriBridge.getCurrentWindow().title(),
    setTitle: (title) => tauriBridge.getCurrentWindow().setTitle(title),
    close: () => tauriBridge.getCurrentWindow().close(),
    onCloseRequested: (handler) => tauriBridge.getCurrentWindow().onCloseRequested(handler),
  },

  config: {
    appConfigDir: () => tauriBridge.appConfigDir(),
  },

  settings: {
    load: () => invokeCommand('load_app_settings'),
    save: (request) => invokeCommand('save_app_settings', { request }),
    loadSecretKey: () => invokeCommand<string | null>('load_secret_key'),
    setCoverImage: (sourcePath) => invokeCommand<string>('set_cover_image', { sourcePath }),
    clearCoverImage: async () => {
      await invokeCommand('clear_cover_image');
    },
  },

  errorLog: {
    append: (entry) => invokeCommand<string>('append_error_log', { request: entry }),
  },

  media: {
    resolveResource: (relativePath) => tauriBridge.resolveResource(relativePath),
  },
};
