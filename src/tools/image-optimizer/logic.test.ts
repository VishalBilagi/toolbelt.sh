import { describe, expect, test } from 'bun:test';
import { createSavingsSummary, estimateTargetQuality, formatBytes, parseExifFromJpeg } from './logic';

const buildSimpleExifJpeg = (): ArrayBuffer => {
  const buffer = new ArrayBuffer(256);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  let offset = 0;
  bytes[offset++] = 0xff;
  bytes[offset++] = 0xd8;
  bytes[offset++] = 0xff;
  bytes[offset++] = 0xe1;

  const lengthPos = offset;
  offset += 2;

  bytes.set([0x45, 0x78, 0x69, 0x66, 0x00, 0x00], offset); // Exif\0\0
  offset += 6;

  const tiffStart = offset;
  bytes.set([0x49, 0x49, 0x2a, 0x00], offset);
  offset += 4;
  view.setUint32(offset, 8, true); // first IFD
  offset += 4;

  const ifd0Start = tiffStart + 8;
  view.setUint16(ifd0Start, 3, true);

  // Tag Make (ASCII, offset to string)
  view.setUint16(ifd0Start + 2, 0x010f, true);
  view.setUint16(ifd0Start + 4, 2, true);
  view.setUint32(ifd0Start + 6, 8, true);
  view.setUint32(ifd0Start + 10, 56, true);

  // Tag Model (ASCII)
  view.setUint16(ifd0Start + 14, 0x0110, true);
  view.setUint16(ifd0Start + 16, 2, true);
  view.setUint32(ifd0Start + 18, 7, true);
  view.setUint32(ifd0Start + 22, 64, true);

  // Exif pointer
  view.setUint16(ifd0Start + 26, 0x8769, true);
  view.setUint16(ifd0Start + 28, 4, true);
  view.setUint32(ifd0Start + 30, 1, true);
  view.setUint32(ifd0Start + 34, 80, true);

  view.setUint32(ifd0Start + 38, 0, true);

  bytes.set(new TextEncoder().encode('ToolCam\0\0'), tiffStart + 56);
  bytes.set(new TextEncoder().encode('Mk-100\0'), tiffStart + 64);

  const exifIfdStart = tiffStart + 80;
  view.setUint16(exifIfdStart, 2, true);

  // ISO tag
  view.setUint16(exifIfdStart + 2, 0x8827, true);
  view.setUint16(exifIfdStart + 4, 3, true);
  view.setUint32(exifIfdStart + 6, 1, true);
  view.setUint16(exifIfdStart + 10, 200, true);

  // DateTimeOriginal
  view.setUint16(exifIfdStart + 14, 0x9003, true);
  view.setUint16(exifIfdStart + 16, 2, true);
  view.setUint32(exifIfdStart + 18, 20, true);
  view.setUint32(exifIfdStart + 22, 110, true);

  view.setUint32(exifIfdStart + 26, 0, true);
  bytes.set(new TextEncoder().encode('2026:02:24 10:11:12\0'), tiffStart + 110);

  const segmentLength = (tiffStart + 160) - (lengthPos + 2);
  view.setUint16(lengthPos, segmentLength, false);

  bytes[tiffStart + 160] = 0xff;
  bytes[tiffStart + 161] = 0xd9;

  return buffer.slice(0, tiffStart + 162);
};

describe('formatBytes', () => {
  test('formats bytes across units', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1024)).toBe('1.00 KB');
    expect(formatBytes(1048576)).toBe('1.00 MB');
  });
});

describe('createSavingsSummary', () => {
  test('calculates saved bytes and percent', () => {
    const summary = createSavingsSummary(1000, 600);
    expect(summary.savedBytes).toBe(400);
    expect(summary.savedPercent).toBe(40);
  });
});

describe('estimateTargetQuality', () => {
  test('finds quality close to target bytes', async () => {
    const result = await estimateTargetQuality(500, async (quality) => Math.round(quality * 1000));
    expect(result.outputBytes).toBeLessThanOrEqual(500);
  });
});

describe('parseExifFromJpeg', () => {
  test('reads exif fields from jpeg exif segment', () => {
    const parsed = parseExifFromJpeg(buildSimpleExifJpeg());
    expect(parsed?.make).toBe('ToolCam');
    expect(parsed?.model).toBe('Mk-100');
    expect(parsed?.iso).toBe(200);
    expect(parsed?.dateTimeOriginal).toBe('2026:02:24 10:11:12');
  });

  test('returns null when no exif segment exists', () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x04, 0x00, 0x00, 0xff, 0xd9]);
    expect(parseExifFromJpeg(bytes.buffer)).toBeNull();
  });
});
