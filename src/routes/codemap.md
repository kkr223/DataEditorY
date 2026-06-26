# src/routes/

## Responsibility

SvelteKit Routes — single-page application with one route.

## Files

- `+layout.ts` — disables SSR (`export const ssr = false`), enables SPA prerendering
- `+layout.svelte` — root layout: initializes i18n, sets up app shell, listens for file association events, projects CDB-only shell tabs
- `+page.svelte` — main page: renders `WorkbenchHost`

## Design

The entire app is a single SPA page. SvelteKit's static adapter generates an `index.html` fallback. The shell keeps top-level navigation focused on CDB workspaces; current-card surfaces are rendered by the active CDB workbench.

## Integration

- **Consumed by**: SvelteKit router
- **Depends on**: stores (`db`, `editor`), platform (`WorkbenchHost`), i18n, features
