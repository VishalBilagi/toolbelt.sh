import { describe, expect, test } from 'bun:test';

import { extractPalette, formatHsl, formatRgb, mapClientPointToPixel, rgbToHex, rgbToHsl, samplePixel } from './logic';

describe('pixel mapping and sampling', () => {
  test('maps client position correctly for scaled canvas', () => {
    const point = mapClientPointToPixel(150, 80, { left: 100, top: 40, width: 100, height: 80 }, 200, 160);
    expect(point).toEqual({ x: 100, y: 80 });
  });

  test('samples pixel with safe clamping', () => {
    const data = new Uint8ClampedArray([
      255, 0, 0, 255,
      0, 255, 0, 255,
      0, 0, 255, 255,
      255, 255, 0, 255
    ]);

    const color = samplePixel(data, 2, 2, 9, 9);
    expect(color).toEqual({ r: 255, g: 255, b: 0 });
  });
});

describe('color formatting', () => {
  test('converts rgb values to hex and hsl', () => {
    const rgb = { r: 255, g: 0, b: 0 };
    expect(rgbToHex(rgb)).toBe('#ff0000');
    expect(rgbToHsl(rgb)).toEqual({ h: 0, s: 100, l: 50 });
    expect(formatRgb(rgb)).toBe('rgb(255, 0, 0)');
    expect(formatHsl(rgbToHsl(rgb))).toBe('hsl(0, 100%, 50%)');
  });
});

describe('palette extraction', () => {
  test('returns dominant colors deterministically', () => {
    const pixels = new Uint8ClampedArray([
      240, 20, 20, 255,
      240, 20, 20, 255,
      240, 20, 20, 255,
      240, 20, 20, 255,
      20, 20, 240, 255,
      20, 20, 240, 255
    ]);

    const first = extractPalette(pixels, 6, 1, { colorCount: 2, maxSamples: 1000, iterations: 8 });
    const second = extractPalette(pixels, 6, 1, { colorCount: 2, maxSamples: 1000, iterations: 8 });

    expect(first).toEqual(second);
    expect(first[0]).toEqual({ r: 240, g: 20, b: 20 });
    expect(first[1]).toEqual({ r: 20, g: 20, b: 240 });
  });
});
