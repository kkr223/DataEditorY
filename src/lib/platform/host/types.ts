export type HostKind = 'tauri' | 'web';

export type HostFileFilter = {
  name: string;
  extensions: string[];
};

export type HostOpenOptions = {
  title?: string;
  multiple?: boolean;
  directory?: boolean;
  defaultPath?: string;
  filters?: HostFileFilter[];
};

export type HostSaveOptions = {
  title?: string;
  defaultPath?: string;
  filters?: HostFileFilter[];
};

export type HostMessageOptions = {
  title?: string;
  kind?: 'info' | 'warning' | 'error';
};

export type HostDragPayload = {
  paths: string[];
};

export type HostWindowCloseEvent = {
  preventDefault: () => void;
};

export type HostTaskProgressEvent = {
  task: 'package' | 'merge';
  stage: string;
  current: number;
  total: number;
};

/** Events shared by the Tauri host and the browser host. */
export type HostEventMap = {
  'open-cdb-paths': string[];
  'file-drop': HostDragPayload;
  'file-drag-enter': HostDragPayload;
  'file-drag-leave': void;
  'background-task-progress': HostTaskProgressEvent;
};

export type HostEventName = keyof HostEventMap;

export type HostUnlisten = () => void;

export interface HostAdapter {
  kind: HostKind;
  capabilities: {
    revealInFileManager: boolean;
    openExternalEditor: boolean;
    /** Writing back to the imported file without a download. */
    writeBackToSource: boolean;
    directoryPicker: boolean;
    fileAssociations: boolean;
    nativeWindow: boolean;
  };

  dialogs: {
    open(options?: HostOpenOptions): Promise<string | string[] | null>;
    save(options?: HostSaveOptions): Promise<string | null>;
    confirm(message: string, options?: HostMessageOptions): Promise<boolean>;
    message(message: string, options?: HostMessageOptions): Promise<void>;
  };

  events: {
    listen<K extends HostEventName>(
      name: K,
      handler: (payload: HostEventMap[K]) => void,
    ): Promise<HostUnlisten>;
  };

  window: {
    title(): Promise<string>;
    setTitle(title: string): Promise<void>;
    close(): Promise<void>;
    onCloseRequested(handler: (event: HostWindowCloseEvent) => void): Promise<HostUnlisten>;
  };

  config: {
    appConfigDir(): Promise<string>;
  };

  settings: {
    load(): Promise<unknown>;
    save(request: unknown): Promise<unknown>;
    loadSecretKey(): Promise<string | null>;
    setCoverImage(sourcePath: string): Promise<string>;
    clearCoverImage(): Promise<void>;
  };

  metadata: {
    load(cdbPath: string): Promise<unknown>;
    save(cdbPath: string, metadata: unknown, sourceCdbPath?: string): Promise<unknown>;
  };

  fs: {
    readBinary(path: string): Promise<Uint8Array>;
    readText(path: string): Promise<string>;
    writeBinary(path: string, data: Uint8Array): Promise<void>;
    writeText(path: string, content: string): Promise<void>;
    exists(path: string): Promise<boolean>;
    listDirectory(path: string): Promise<string[]>;
  };

  errorLog: {
    append(entry: {
      source: string;
      message: string;
      stack: string;
      extra?: string;
    }): Promise<string | null>;
  };

  media: {
    resolveResource(relativePath: string): Promise<string>;
    /** Synchronous display URL (Tauri custom protocol or a browser-safe path). */
    toDisplayUrl(path: string, revision?: number): string;
  };
}
