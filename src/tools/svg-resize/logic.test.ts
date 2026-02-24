import { describe, expect, test } from 'bun:test';

import {
  deriveSizeFromHeight,
  deriveSizeFromScale,
  deriveSizeFromWidth,
  evaluateOutputGuardrails,
  parseSvgDimensions,
  serializeSvgWithSize
} from './logic';

describe('parseSvgDimensions', () => {
  test('prefers viewBox dimensions over width/height attributes', () => {
    const svg = '<svg width="24" height="24" viewBox="0 0 256 128"></svg>';
    const parsed = parseSvgDimensions(svg);

    expect(parsed.source).toBe('viewBox');
    expect(parsed.width).toBe(256);
    expect(parsed.height).toBe(128);
    expect(parsed.aspectRatio).toBe(2);
  });

  test('falls back to numeric width/height attributes', () => {
    const svg = '<svg width="300px" height="200"></svg>';
    const parsed = parseSvgDimensions(svg);

    expect(parsed.source).toBe('attributes');
    expect(parsed.width).toBe(300);
    expect(parsed.height).toBe(200);
  });

  test('throws when dimensions cannot be read', () => {
    expect(() => parseSvgDimensions('<svg width="100%" height="100%"></svg>')).toThrow(
      'Could not read SVG dimensions'
    );
  });
});

describe('size derivation helpers', () => {
  test('deriveSizeFromScale preserves aspect ratio with rounded output', () => {
    const next = deriveSizeFromScale(256, 128, 1.25);
    expect(next.width).toBe(320);
    expect(next.height).toBe(160);
    expect(next.scale).toBe(1.25);
  });

  test('deriveSizeFromWidth and deriveSizeFromHeight keep aspect lock', () => {
    expect(deriveSizeFromWidth(256, 128, 512)).toEqual({ width: 512, height: 256, scale: 2 });
    expect(deriveSizeFromHeight(256, 128, 512)).toEqual({ width: 1024, height: 512, scale: 4 });
  });
});

describe('serializeSvgWithSize', () => {
  test('updates width/height and preserves viewBox', () => {
    const input = '<svg viewBox="0 0 64 64" width="64" height="64"><rect width="64" height="64"/></svg>';
    const output = serializeSvgWithSize(input, 512, 512);

    expect(output).toContain('viewBox="0 0 64 64"');
    expect(output).toContain('width="512"');
    expect(output).toContain('height="512"');
  });
});

describe('evaluateOutputGuardrails', () => {
  test('blocks oversize dimension and warns on large megapixels', () => {
    const result = evaluateOutputGuardrails(9000, 3000);
    expect(result.blocking[0]).toContain('8192px');
    expect(result.warnings[0]).toContain('May be slow or fail');
  });
});
