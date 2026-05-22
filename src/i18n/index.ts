import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type SupportedLocale } from './config';
import en from './messages/en';
import es from './messages/es';

export type TranslationKey = keyof typeof en;
export type TranslationParams = Record<string, string | number>;

type TranslationDictionary = Record<TranslationKey, string>;
type LocaleDictionary = Partial<TranslationDictionary>;

const translationsByLocale: Record<SupportedLocale, LocaleDictionary> = {
  en,
  es,
};

const missingTranslationWarnings = new Set<string>();

const isDevEnvironment = (): boolean => {
  const nodeEnv = typeof process !== 'undefined' ? process.env.NODE_ENV : undefined;
  return nodeEnv !== 'production';
};

const normalizePathname = (pathname: string): string => {
  if (pathname.length === 0) return '/';

  let normalized = pathname.startsWith('/') ? pathname : `/${pathname}`;
  normalized = normalized.replace(/\/index\.html$/, '/');
  normalized = normalized.replace(/\/{2,}/g, '/');

  if (normalized !== '/' && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }

  return normalized || '/';
};

export const isSupportedLocale = (value: string | undefined | null): value is SupportedLocale =>
  typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);

export const resolveLocaleFromPathname = (pathname: string): SupportedLocale => {
  const normalized = normalizePathname(pathname);
  const [, maybeLocale] = normalized.split('/');
  return isSupportedLocale(maybeLocale) ? maybeLocale : DEFAULT_LOCALE;
};

export const stripLocalePrefix = (pathname: string): string => {
  const normalized = normalizePathname(pathname);
  const segments = normalized.split('/').filter(Boolean);

  if (segments.length === 0) return '/';
  if (!isSupportedLocale(segments[0])) return normalized;

  const stripped = `/${segments.slice(1).join('/')}`;
  return normalizePathname(stripped);
};

export const hasLocalePrefix = (pathname: string): boolean => {
  const normalized = normalizePathname(pathname);
  const [, maybeLocale] = normalized.split('/');
  return isSupportedLocale(maybeLocale);
};

export const supportsLocalizedRoute = (pathname: string): boolean => {
  const basePath = stripLocalePrefix(pathname);
  return basePath === '/' || basePath === '/tools' || basePath.startsWith('/tools/');
};

export const toPrefixedLocalePath = (pathname: string, locale: SupportedLocale): string => {
  const basePath = stripLocalePrefix(pathname);
  return basePath === '/' ? `/${locale}` : `/${locale}${basePath}`;
};

export const localizeAppLink = (pathname: string, locale: SupportedLocale): string => {
  const basePath = stripLocalePrefix(pathname);
  if (locale === DEFAULT_LOCALE) {
    return basePath;
  }

  if (!supportsLocalizedRoute(basePath)) {
    return basePath;
  }

  return toPrefixedLocalePath(basePath, locale);
};

export const getLocaleSwitcherPath = (pathname: string, targetLocale: SupportedLocale): string => {
  const basePath = stripLocalePrefix(pathname);

  if (supportsLocalizedRoute(basePath)) {
    return toPrefixedLocalePath(basePath, targetLocale);
  }

  if (basePath.startsWith('/tools/')) {
    return toPrefixedLocalePath('/tools', targetLocale);
  }

  if (basePath === '/tools') {
    return toPrefixedLocalePath('/tools', targetLocale);
  }

  return toPrefixedLocalePath('/', targetLocale);
};

export const getAlternateLocaleLinks = (
  currentUrl: URL
): Array<{ locale: SupportedLocale | 'x-default'; href: string }> => {
  const basePath = stripLocalePrefix(currentUrl.pathname);

  if (!supportsLocalizedRoute(basePath)) {
    return [];
  }

  const origin = currentUrl.origin;
  const links = SUPPORTED_LOCALES.map((locale) => ({
    locale,
    href: new URL(toPrefixedLocalePath(basePath, locale), origin).toString(),
  }));

  return [
    ...links,
    {
      locale: 'x-default' as const,
      href: new URL(basePath, origin).toString(),
    },
  ];
};

const interpolate = (template: string, params?: TranslationParams): string => {
  if (!params) return template;

  let result = template;
  for (const [key, value] of Object.entries(params)) {
    result = result.replaceAll(`{${key}}`, String(value));
  }

  return result;
};

const warnMissingTranslation = (locale: SupportedLocale, key: TranslationKey): void => {
  if (!isDevEnvironment()) return;

  const warningKey = `${locale}:${key}`;
  if (missingTranslationWarnings.has(warningKey)) return;

  missingTranslationWarnings.add(warningKey);
  console.warn(`[i18n] Missing translation for "${key}" in locale "${locale}". Falling back to "${DEFAULT_LOCALE}".`);
};

export const t = (locale: SupportedLocale, key: TranslationKey, params?: TranslationParams): string => {
  const dictionary = translationsByLocale[locale];
  const defaultDictionary = translationsByLocale[DEFAULT_LOCALE] as TranslationDictionary;

  const template = dictionary[key] ?? defaultDictionary[key];
  if (dictionary[key] == null) {
    warnMissingTranslation(locale, key);
  }

  if (template == null) {
    return key;
  }

  return interpolate(template, params);
};

export const createTranslator = (locale: SupportedLocale) => {
  return (key: TranslationKey, params?: TranslationParams): string => t(locale, key, params);
};

const TOOL_SECTION_TITLE_KEY_BY_ID = {
  'image-graphics': 'toolSections.image-graphics.title',
  'text-developer': 'toolSections.text-developer.title',
  'data-security': 'toolSections.data-security.title',
} as const satisfies Record<string, TranslationKey>;

const TOOL_TEXT_KEYS_BY_HREF = {
  '/tools/qr': { name: 'tools.qr.name', description: 'tools.qr.description' },
  '/tools/color-picker': { name: 'tools.color-picker.name', description: 'tools.color-picker.description' },
  '/tools/svg-resize': { name: 'tools.svg-resize.name', description: 'tools.svg-resize.description' },
  '/tools/image-optimizer': { name: 'tools.image-optimizer.name', description: 'tools.image-optimizer.description' },
  '/tools/image-editor': { name: 'tools.image-editor.name', description: 'tools.image-editor.description' },
  '/tools/text-tools': { name: 'tools.text-tools.name', description: 'tools.text-tools.description' },
  '/tools/developer-inspectors': {
    name: 'tools.developer-inspectors.name',
    description: 'tools.developer-inspectors.description',
  },
  '/tools/encoding-token': { name: 'tools.encoding-token.name', description: 'tools.encoding-token.description' },
  '/tools/epoch': { name: 'tools.epoch.name', description: 'tools.epoch.description' },
  '/tools/data-utils': { name: 'tools.data-utils.name', description: 'tools.data-utils.description' },
  '/tools/crypto': { name: 'tools.crypto.name', description: 'tools.crypto.description' },
  '/tools/pdf-toolkit': { name: 'tools.pdf-toolkit.name', description: 'tools.pdf-toolkit.description' },
} as const satisfies Record<string, { name: TranslationKey; description: TranslationKey }>;

export const getLocalizedToolSectionTitle = (
  locale: SupportedLocale,
  sectionId: string,
  fallbackTitle: string
): string => {
  const key = TOOL_SECTION_TITLE_KEY_BY_ID[sectionId];
  return key ? t(locale, key) : fallbackTitle;
};

export const getLocalizedToolText = (
  locale: SupportedLocale,
  href: string,
  fallbackName: string,
  fallbackDescription: string
): { name: string; description: string } => {
  const keys = TOOL_TEXT_KEYS_BY_HREF[href];
  if (!keys) {
    return { name: fallbackName, description: fallbackDescription };
  }

  return {
    name: t(locale, keys.name),
    description: t(locale, keys.description),
  };
};

export const getLocalizedStaticPaths = (): Array<{ params: { locale: SupportedLocale } }> => {
  return SUPPORTED_LOCALES.map((locale) => ({
    params: { locale },
  }));
};
