# src/lib/infrastructure/

## Responsibility

Infrastructure Layer — provides the low-level Tauri IPC bridge between the TypeScript frontend and the Rust backend. Product code should usually use `src/lib/native/` typed APIs; this layer owns raw `invoke()` and document-host transport.

## Design

Single adapter implementation for the Tauri runtime.

## Integration

- **Consumed by**: native APIs, platform (`appRuntime.ts`), selected low-level stores/services
- **Depends on**: `@tauri-apps/api`, `@tauri-apps/plugin-dialog`, `@tauri-apps/plugin-fs`
- **Sub-map**: [tauri/](tauri/codemap.md)
