# i18n Foundation

## Supported locales

- `en` (default, unprefixed canonical routes like `/` and `/tools`)
- `es` (locale-prefixed routes like `/es` and `/es/tools`)

## Routing rules

- Default locale pages continue to work on existing unprefixed routes.
- Locale-prefixed routes are added as wrappers under `src/pages/[locale]/...`.
- Current localized wrappers cover:
  - `/[locale]`
  - `/[locale]/tools`
  - `/[locale]/tools/*` (tool pages mirrored from existing `/tools/*` routes)
- `AppShell` language switching keeps users on the same page for localized routes and falls back to `/[locale]` for routes outside current localized coverage.

## Fallback rules

- `t(locale, key)` falls back to the default locale (`en`) when a translation key is missing.
- Missing keys never crash rendering.
- In non-production environments, missing keys emit a one-time `console.warn`.

## Adding or updating translation keys

1. Add the key to `src/i18n/messages/en.ts` (this defines the typed key set).
2. Add the translated value in `src/i18n/messages/es.ts` (or leave it out temporarily to use fallback behavior).
3. Use `t(locale, 'your.key')` or `createTranslator(locale)` from `src/i18n/index.ts`.

## Adding a new locale

1. Add the locale code to `SUPPORTED_LOCALES` in `src/i18n/config.ts`.
2. Create `src/i18n/messages/<locale>.ts` as `Partial<Record<TranslationKey, string>>`.
3. Register it in `translationsByLocale` in `src/i18n/index.ts`.
4. Add localized route wrappers under `src/pages/[locale]/...` for any additional non-tool routes you want to expose.
