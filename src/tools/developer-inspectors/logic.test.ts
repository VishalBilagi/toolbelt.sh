import { describe, expect, test } from 'bun:test';

import {
  applyAssetSizeHints,
  bytesToDataUrl,
  extractPageAssets,
  inspectMime,
  parseDataUrl,
  summarizePageAssets
} from './logic';

describe('Data URL conversion', () => {
  test('preserves bytes through base64 Data URL round trip', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255, 100]);
    const dataUrl = bytesToDataUrl(bytes, { mimeType: 'application/octet-stream' });
    const parsed = parseDataUrl(dataUrl);

    expect(parsed.mimeType).toBe('application/octet-stream');
    expect(parsed.isBase64).toBe(true);
    expect(Array.from(parsed.bytes)).toEqual(Array.from(bytes));
  });

  test('parses percent-encoded text Data URLs', () => {
    const parsed = parseDataUrl('data:text/plain,Hello%20World');
    expect(parsed.mimeType).toBe('text/plain');
    expect(new TextDecoder().decode(parsed.bytes)).toBe('Hello World');
  });
});

describe('MIME inspector', () => {
  test('detects png via signature with high confidence', () => {
    const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    const result = inspectMime({ fileName: 'image.png', bytes: pngHeader });

    expect(result.mimeType).toBe('image/png');
    expect(result.confidence).toBe('high');
    expect(result.hexSignature).toContain('89 50 4E 47');
  });

  test('reports extension/signature conflicts', () => {
    const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const result = inspectMime({ fileName: 'photo.jpg', bytes: pngHeader });

    expect(result.mimeType).toBe('image/png');
    expect(result.confidence).toBe('medium');
    expect(result.notes.join(' ')).toContain('extension suggests image/jpeg');
  });
});

describe('Page asset extraction and summary', () => {
  test('extracts assets from html including srcset and data urls', () => {
    const html = `
      <link rel="stylesheet" href="/styles/site.css" />
      <script src="/app.js"></script>
      <img src="/hero.png" srcset="/hero@2x.png 2x, data:image/gif;base64,R0lGODlhAQABAAAAACw= 1x" />
      <link rel="preload" as="font" href="/fonts/site.woff2" />
    `;

    const assets = extractPageAssets(html, 'https://toolbelt.dev/docs/page');
    const urls = assets.map((asset) => asset.url);

    expect(urls).toContain('https://toolbelt.dev/styles/site.css');
    expect(urls).toContain('https://toolbelt.dev/app.js');
    expect(urls).toContain('https://toolbelt.dev/hero.png');
    expect(urls).toContain('https://toolbelt.dev/hero@2x.png');
    expect(urls.some((url) => url.startsWith('data:image/gif;base64,'))).toBe(true);

    const inlineAsset = assets.find((asset) => asset.isInline);
    expect(inlineAsset?.sizeBytes).toBeGreaterThan(0);
  });

  test('summarizes kinds, duplicates, and applies size hints', () => {
    const assets = extractPageAssets(
      `
      <script src="/main.js"></script>
      <script src="/main.js"></script>
      <img src="/logo.png" />
      <link rel="stylesheet" href="/site.css" />
    `,
      'https://example.com'
    );

    const withSizes = applyAssetSizeHints(assets, {
      'https://example.com/main.js': 12000,
      'https://example.com/logo.png': 3000
    });
    const summary = summarizePageAssets(withSizes);

    expect(summary.totalAssets).toBe(4);
    expect(summary.uniqueAssetCount).toBe(3);
    expect(summary.duplicateAssetCount).toBe(1);
    expect(summary.knownSizeBytes).toBe(27000);
    expect(summary.kindBreakdown.find((row) => row.kind === 'script')?.count).toBe(2);
    expect(summary.kindBreakdown.find((row) => row.kind === 'stylesheet')?.unknownSizeCount).toBe(1);
  });
});

