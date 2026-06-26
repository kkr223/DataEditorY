# src/lib/modules/settings/

## Responsibility
Settings Module — provides the settings document type, in-memory provider, and settings workbench.

## Design
- `SETTINGS_TYPE` = `dataeditory.settings` with auto-save policy
- `SETTINGS_PROVIDER_ID` — `MemoryDocumentProvider`
- `settings.workbench` renders `SettingsWorkbench.svelte`

## Integration
- **Depended on by**: `ai` module (for AI settings section contribution)
