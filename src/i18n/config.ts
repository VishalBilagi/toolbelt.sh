export const SUPPORTED_LOCALES = ['en', 'es'] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = 'en';

export const PREFERRED_LOCALE_STORAGE_KEY = 'toolbelt:locale';
export const PREFERRED_LOCALE_COOKIE = 'toolbelt_locale';
