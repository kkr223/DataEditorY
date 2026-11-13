import type {
  HostAdapter,
  HostDragPayload,
  HostEventMap,
  HostEventName,
  HostMessageOptions,
  HostOpenOptions,
  HostSaveOptions,
} from './types.ts';
import { WebFileStore } from './webFiles.ts';
import { indexedDbFiles } from './webFilePersistence.ts';

const SETTINGS_KEY = 'dataeditory.web.settings';
const fileStore = new WebFileStore(() => localStorage, indexedDbFiles);

function fileExtensionFilters(options?: HostOpenOptions) {
  const extensions = options?.filters?.flatMap((filter) => filter.extensions) ?? [];
  return extensions.map((extension) => `.${extension}`).join(',');
}

async function importFile(file: File) {
  return fileStore.import(file);
}

function pickFiles(options?: HostOpenOptions): Promise<string | string[] | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = options?.multiple === true;
    const accept = fileExtensionFilters(options);
    if (accept) input.accept = accept;
    if (options?.directory) input.setAttribute('webkitdirectory', '');
    input.style.display = 'none';
    document.body.appendChild(input);
    let settled = false;
    const finish = (value: string | string[] | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(value);
    };
    input.addEventListener('change', () => {
      const files = Array.from(input.files ?? []);
      if (files.length === 0) {
        finish(null);
        return;
      }
      void Promise.all(files.map(importFile))
        .then((paths) => finish(options?.multiple ? paths : paths[0] ?? null));
    });
    input.addEventListener('cancel', () => finish(null));
    input.click();
  });
}

function basename(path: string) {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? 'download';
}

function download(path: string, bytes: Uint8Array) {
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = basename(path);
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function dragPayload(event: DragEvent): HostDragPayload {
  const files = Array.from(event.dataTransfer?.files ?? []);
  return { paths: files.map((file) => file.name) };
}

/** Browser host: files are imported into an in-memory map and exported as downloads. */
export const webHost: HostAdapter = {
  kind: 'web',
  capabilities: {
    revealInFileManager: false,
    openExternalEditor: false,
    writeBackToSource: false,
    directoryPicker: typeof window !== 'undefined' && 'showDirectoryPicker' in window,
    fileAssociations: false,
    nativeWindow: false,
  },

  dialogs: {
    open: pickFiles,
    save: async (options?: HostSaveOptions) => {
      const name = basename(options?.defaultPath ?? 'export.cdb');
      return `vfs://exports/${Date.now()}/${name}`;
    },
    confirm: async (message: string, options?: HostMessageOptions) => window.confirm(
      options?.title ? `${options.title}\n\n${message}` : message,
    ),
    message: async (message: string, options?: HostMessageOptions) => {
      window.alert(options?.title ? `${options.title}\n\n${message}` : message);
    },
  },

  events: {
    listen: <K extends HostEventName>(
      name: K,
      handler: (payload: HostEventMap[K]) => void,
    ) => {
      if (name === 'file-drag-enter' || name === 'file-drop') {
        const onDragOver = (event: DragEvent) => {
          if (!event.dataTransfer?.types.includes('Files')) return;
          event.preventDefault();
          if (name === 'file-drag-enter') handler(dragPayload(event) as HostEventMap[K]);
        };
        const onDrop = (event: DragEvent) => {
          if (!event.dataTransfer?.types.includes('Files')) return;
          event.preventDefault();
          const files = Array.from(event.dataTransfer.files);
          void Promise.all(files.map(importFile))
            .then((paths) => handler({ paths } as HostEventMap[K]));
        };
        const listener = name === 'file-drop' ? onDrop : onDragOver;
        window.addEventListener(name === 'file-drop' ? 'drop' : 'dragover', listener);
        return Promise.resolve(() => window.removeEventListener(
          name === 'file-drop' ? 'drop' : 'dragover',
          listener,
        ));
      }
      if (name === 'file-drag-leave') {
        const onLeave = (event: DragEvent) => {
          if (event.relatedTarget) return;
          handler(undefined as HostEventMap[K]);
        };
        window.addEventListener('dragleave', onLeave);
        return Promise.resolve(() => window.removeEventListener('dragleave', onLeave));
      }
      return Promise.resolve(() => {});
    },
  },

  window: {
    title: async () => document.title,
    setTitle: async (title: string) => { document.title = title; },
    close: async () => { window.close(); },
    onCloseRequested: async () => () => {},
  },

  config: {
    appConfigDir: async () => 'vfs://config',
  },

  settings: {
    load: async () => {
      try {
        return JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
      } catch {
        return {};
      }
    },
    save: async (request) => {
      const next = { ...(await webHost.settings.load() as Record<string, unknown>), ...(request as Record<string, unknown>) };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      return next;
    },
    loadSecretKey: async () => null,
    setCoverImage: async () => '',
    clearCoverImage: async () => {},
  },

  metadata: {
    load: async (cdbPath) => {
      const id = await fileStore.workspaceId(cdbPath);
      try {
        const saved = JSON.parse(localStorage.getItem(`dataeditory.web.workspace.${id}`) ?? 'null');
        return { ...(saved ?? {}), version: 1, cdbPath };
      } catch {
        return { version: 1, cdbPath };
      }
    },
    save: async (cdbPath, metadata) => {
      const base = metadata && typeof metadata === 'object' ? metadata as Record<string, unknown> : {};
      const next = {
        ...base,
        version: 1,
        cdbPath,
        updatedAt: new Date().toISOString(),
      };
      const id = await fileStore.workspaceId(cdbPath);
      localStorage.setItem(`dataeditory.web.workspace.${id}`, JSON.stringify(next));
      return next;
    },
  },

  fs: {
    readBinary: async (path) => fileStore.read(path),
    readText: async (path) => new TextDecoder().decode(await webHost.fs.readBinary(path)),
    writeBinary: async (path, data) => {
      await fileStore.write(path, data);
      if (path.startsWith('vfs://exports/') || path.startsWith('vfs://imports/')) download(path, data);
    },
    writeText: async (path, content) => {
      await webHost.fs.writeBinary(path, new TextEncoder().encode(content));
    },
    exists: async (path) => fileStore.exists(path),
    listDirectory: async (path) => fileStore.list(path),
  },

  errorLog: {
    append: async (entry) => {
      console.error('[DataEditorY]', entry.source, entry.message);
      return null;
    },
  },

  media: {
    resolveResource: async (relativePath) => `/${relativePath.replace(/^\/+/, '')}`,
    toDisplayUrl: (path, revision) => revision === undefined ? path : `${path}${path.includes('?') ? '&' : '?'}v=${revision}`,
  },
};

export const host = webHost;

export type {
  HostAdapter,
  HostDragPayload,
  HostEventMap,
  HostEventName,
  HostFileFilter,
  HostKind,
  HostMessageOptions,
  HostOpenOptions,
  HostSaveOptions,
  HostUnlisten,
  HostWindowCloseEvent,
} from './types.ts';
