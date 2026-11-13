# src/lib/core/

## Responsibility

Core Abstractions Layer — defines workspace projections, CDB path identity, synchronous path utilities, and editor snapshots used by the CDB-first shell. The projection can still represent compatibility document types, but top-level shell tabs are CDB workspaces.

`path.ts` provides platform-neutral `join`/`dirname`/`basename`/`extname` helpers that keep Windows separators and `vfs://` scheme prefixes. UI and store code must use these instead of Tauri path IPC, so the same code runs in the browser host.

## Integration

- **Sub-map**: [workspace/](workspace/codemap.md)
