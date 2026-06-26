# src/lib/features/settings/

## Responsibility

Settings UI Feature — manages the settings panel with sections for AI configuration, script templates, keyboard shortcuts, package settings, and cover image.

## Design

- **`controller.ts`** — settings load/save orchestration
- **`useCases.ts`** — base settings use cases
- **`extraUseCases.ts`** — reserved for variant-specific settings use cases

### Components

- `SettingsHeader.svelte` — settings panel header
- `SettingsAiCard.svelte` — AI API URL/key/temperature configuration
- `SettingsTemplateCard.svelte` — Lua script template and AI script directory editor
- `SettingsShortcutsCard.svelte` — keyboard shortcut customization
- `SettingsPackageCard.svelte` — package export settings
- `SettingsCoverAndLog.svelte` — cover image and error log management

## Integration

- **Consumed by**: `modules/settings/workbench/SettingsWorkbench.svelte`
- **Depends on**: stores (`appSettings`), infrastructure (settings commands)
