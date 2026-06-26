# src/lib/i18n/

## Responsibility

Internationalization — configures `svelte-i18n` with Chinese (`zh`) and English (`en`) locale bundles.

## Design

- `index.ts` — `setupI18n()` function: detects browser locale, maps `zh-*` → `zh`, defaults to `en`, registers locale JSON files
- Locale files: `locales/en.json`, `locales/zh.json`

## Integration

- **Consumed by**: app initialization (`+layout.ts`), all components via `$_()` translation function
- **Depends on**: `svelte-i18n`
