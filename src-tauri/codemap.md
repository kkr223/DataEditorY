# src-tauri/

## Responsibility

Tauri Application Package — Rust backend configuration, build scripts, icons, capabilities, and the source code root.

## Files

| File | Purpose |
|------|---------|
| `Cargo.toml` | Rust dependencies: tauri 2, ygopro-cdb-encode-rs, image, zip, aes-gcm, regex, etc. |
| `tauri.conf.json` | Tauri config: window settings, build commands, bundle resources, file associations (`.cdb`) |
| `build.rs` | Tauri build script |
| `capabilities/` | Tauri permission capabilities |
| `icons/` | Application icons (ICO, ICNS, PNG) |
| `resources/` | Runtime resources bundled with the app |

## Sub-map

- [src/](src/codemap.md) — Rust source code
