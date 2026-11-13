import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

let sqlPromise: ReturnType<typeof initSqlJs> | null = null;

function decodeDataUrl(url: string) {
  const binary = atob(url.slice(url.indexOf(',') + 1));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function loadSql() {
  // The standalone build inlines the wasm as a data URL; hand the bytes to
  // sql.js directly so no fetch is needed under file://.
  sqlPromise ??= wasmUrl.startsWith('data:')
    ? initSqlJs({ wasmBinary: decodeDataUrl(wasmUrl).buffer as ArrayBuffer })
    : initSqlJs({ locateFile: () => wasmUrl });
  return sqlPromise;
}
