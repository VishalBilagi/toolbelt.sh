import { describe, expect, test } from 'bun:test';

import {
  deriveLockedHeight,
  deriveLockedWidth,
  getExportFormatWithFallback,
  normalizeCropRect
} from './logic';

describe('normalizeCropRect', () => {
  test('keeps crop values within source bounds', () => {
    expect(normalizeCropRect({ x: -10, y: 400, width: 500, height: 300 }, 320, 240)).toEqual({
      x: 0,
      y: 0,
      width: 320,
      height: 240
    });
  });
});

describe('aspect-ratio helpers', () => {
  test('deriveLockedHeight computes proportional height', () => {
    expect(deriveLockedHeight(1000, 16 / 9, 4000)).toBe(563);
  });

  test('deriveLockedWidth computes proportional width', () => {
    expect(deriveLockedWidth(500, 4 / 3, 4000)).toBe(667);
  });
});

describe('format fallback', () => {
  test('falls back to png when requested format is unsupported', () => {
    expect(
      getExportFormatWithFallback('avif', {
        avif: false,
        webp: true,
        jpeg: true,
        png: true
      })
    ).toBe('png');
  });
});
