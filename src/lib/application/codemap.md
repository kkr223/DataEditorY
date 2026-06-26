# src/lib/application/

## Responsibility

Application Orchestration Layer — cross-cutting concerns that coordinate between multiple features and stores. Manages workspace lifecycle (dirty tracking, save handlers, close guards) and the command bus that routes user actions to the correct workspace type.

## Design

Single sub-module: `workspace/`

## Integration

- **Consumed by**: features (shell, card-editor, script-editor), components, routes
- **Depends on**: stores, platform (document runtime), infrastructure (Tauri dialogs)
- **Sub-map**: [workspace/](workspace/codemap.md)
