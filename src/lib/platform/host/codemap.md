# src/lib/platform/host/

## Responsibility

Platform host boundary for desktop capabilities that differ between Tauri and the browser: dialogs, window control, application events, config paths, settings storage, error logging, and resource paths. Feature/store code imports `host` from `index.ts`; only `tauri.ts` may touch Tauri APIs.

## Modules

| File | Purpose |
|------|---------|
| `types.ts` | `HostAdapter` interface, capability flags, dialog options, host event map |
| `tauri.ts` | Desktop implementation backed by Tauri plugins |
| `index.ts` | Active host export (`tauriHost` today; the web build swaps this module for a browser host) |

## Rules

- No code outside `infrastructure/tauri/` may import `@tauri-apps/*`; `infrastructure/tauriImportBoundary.test.ts` enforces this.
- Host events use platform-neutral names (`file-drop`, `open-cdb-paths`, `background-task-progress`); Tauri event names stay inside `tauri.ts`.
- Dialog APIs return path strings on both platforms. The web host returns virtual filesystem paths, so callers must not assume OS paths.
- Settings and error-log writes go through the host, not direct `invoke()`.
