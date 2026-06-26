# src/lib/utils/

## Responsibility

Utility Functions — small shared helpers that do not belong to a feature, domain module, or native API boundary.

## Files

| File | Purpose |
|------|---------|
| `shortcuts.ts` | Keyboard shortcut detection and matching |
| `mediaProtocol.ts` | Custom `media://` protocol URL builder for Tauri asset serving |
| `errorLog.ts` | Error logging to file via Rust backend |

## Integration

- **Consumed by**: features, components, stores, services
- **Depends on**: infrastructure (Tauri commands)
