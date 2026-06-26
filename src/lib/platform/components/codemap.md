# src/lib/platform/components/

## Responsibility
Platform UI Components — renders the active workbench, contributions, and settings sections based on platform registry state.

## Components
- `WorkbenchHost.svelte` — looks up the active document's workbench from the registry and lazy-loads its component
- `WorkbenchContributions.svelte` — renders slot-based contributions for a given workbench and slot name
- `SettingsSections.svelte` — renders all registered settings sections in order
