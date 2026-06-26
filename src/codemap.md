# src/

## Responsibility

Frontend Source Root — SvelteKit application source. Contains the SPA shell for the CDB-first workspace, global styles, and the `lib/` directory with all application code.

## Files

| File | Purpose |
|------|---------|
| `app.html` | HTML shell template |
| `app.css` | Global CSS styles for the desktop shell and workspace surfaces |
| `ambient.d.ts` | TypeScript ambient declarations (compile-time constants) |
| `bun-test.d.ts` | Bun test type declarations |

## Sub-maps

- [lib/](lib/codemap.md) — layered application code
- [routes/](routes/codemap.md) — SvelteKit shell routes
