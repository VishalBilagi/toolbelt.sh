import { describe, expect, test } from 'bun:test';

import {
  getLocaleSwitcherPath,
  resolveLocaleFromPathname,
  stripLocalePrefix,
  t,
} from './index';
import { DEFAULT_LOCALE } from './config';
import es from './messages/es';

describe('i18n translate helper', () => {
  test('falls back to default locale when translation is missing', () => {
    const key = 'shell.github';
    const original = es[key];

    delete es[key];

    try {
      expect(t('es', key)).toBe(t(DEFAULT_LOCALE, key));
    } finally {
      if (original) {
        es[key] = original;
      }
    }
  });

  test('interpolates params in translated messages', () => {
    expect(t('es', 'i18n.samples.redirectTo', { target: '/tools/image-editor' })).toBe(
      'Redirigiendo a /tools/image-editor'
    );
  });
});

describe('i18n route helpers', () => {
  test('resolves locale and strips prefixes', () => {
    expect(resolveLocaleFromPathname('/es/tools')).toBe('es');
    expect(stripLocalePrefix('/es/tools/crop')).toBe('/tools/crop');
    expect(stripLocalePrefix('/tools')).toBe('/tools');
  });

  test('keeps same path when localized route exists', () => {
    expect(getLocaleSwitcherPath('/tools/crop', 'es')).toBe('/es/tools/crop');
  });

  test('falls back to localized home when route is outside localized coverage', () => {
    expect(getLocaleSwitcherPath('/component-lib', 'es')).toBe('/es');
  });
});
