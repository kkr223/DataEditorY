export interface WebFilePersistence {
  read(path: string): Promise<Uint8Array | undefined>;
  write(path: string, bytes: Uint8Array): Promise<void>;
}

function openFiles(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('dataeditory.web.files', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('files');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function accessFile<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openFiles();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction('files', mode);
      const request = operation(transaction.objectStore('files'));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error ?? request.error ?? new Error('File storage transaction aborted'));
      transaction.onerror = () => reject(transaction.error ?? request.error);
    });
  } finally {
    database.close();
  }
}

/** Snapshots used by recent-file entries after the page is reloaded. */
export const indexedDbFiles: WebFilePersistence = {
  read: (path) => accessFile<Uint8Array | undefined>('readonly', (store) => store.get(path)),
  write: async (path, bytes) => {
    await accessFile('readwrite', (store) => store.put(bytes, path));
  },
};
