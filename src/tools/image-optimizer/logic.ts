export interface ParsedExif {
  make?: string;
  model?: string;
  software?: string;
  dateTime?: string;
  dateTimeOriginal?: string;
  iso?: number;
  exposureTime?: string;
  fNumber?: number;
  focalLength?: number;
  pixelWidth?: number;
  pixelHeight?: number;
  gpsLatitude?: number;
  gpsLongitude?: number;
}

export interface SavingsSummary {
  originalBytes: number;
  outputBytes: number;
  savedBytes: number;
  savedPercent: number;
}

export interface TargetQualityResult {
  quality: number;
  outputBytes: number;
}

interface Segment {
  marker: number;
  start: number;
  length: number;
}

const EXIF_MARKER = 0xe1;
const textDecoder = new TextDecoder('ascii');

export const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let unitIndex = 0;
  let value = bytes;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const precision = value >= 100 || unitIndex === 0 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
};

export const createSavingsSummary = (originalBytes: number, outputBytes: number): SavingsSummary => {
  if (originalBytes <= 0 || outputBytes < 0) {
    throw new Error('Sizes must be non-negative and original size must be greater than zero.');
  }

  const savedBytes = originalBytes - outputBytes;
  return {
    originalBytes,
    outputBytes,
    savedBytes,
    savedPercent: (savedBytes / originalBytes) * 100
  };
};

export const estimateTargetQuality = async (
  targetBytes: number,
  encode: (quality: number) => Promise<number>,
  options?: { minQuality?: number; maxQuality?: number; maxAttempts?: number }
): Promise<TargetQualityResult> => {
  const minQuality = options?.minQuality ?? 0.2;
  const maxQuality = options?.maxQuality ?? 0.95;
  const maxAttempts = options?.maxAttempts ?? 8;

  if (targetBytes <= 0) throw new Error('Target size must be greater than zero.');
  if (minQuality <= 0 || maxQuality > 1 || minQuality > maxQuality) throw new Error('Invalid quality bounds.');

  let low = minQuality;
  let high = maxQuality;
  let best: TargetQualityResult | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const quality = Number(((low + high) / 2).toFixed(4));
    const outputBytes = await encode(quality);

    if (!best || outputBytes <= targetBytes || Math.abs(outputBytes - targetBytes) < Math.abs(best.outputBytes - targetBytes)) {
      best = { quality, outputBytes };
    }

    if (outputBytes > targetBytes) high = quality - 0.01;
    else low = quality + 0.01;

    if (low > high) break;
  }

  if (!best) throw new Error('Unable to estimate quality for target size.');
  return best;
};

const findJpegSegments = (view: DataView): Segment[] => {
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return [];

  const segments: Segment[] = [];
  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) break;

    const marker = view.getUint8(offset + 1);
    if (marker === 0xda || marker === 0xd9) break;

    const length = view.getUint16(offset + 2);
    if (length < 2 || offset + 2 + length > view.byteLength) break;

    segments.push({ marker, start: offset, length });
    offset += length + 2;
  }

  return segments;
};

const readAscii = (view: DataView, offset: number, length: number): string => {
  if (offset < 0 || length <= 0 || offset + length > view.byteLength) return '';
  const bytes = new Uint8Array(view.buffer, view.byteOffset + offset, length);
  return textDecoder.decode(bytes).replaceAll('\u0000', '').trim();
};

const parseRational = (view: DataView, offset: number, littleEndian: boolean): number | null => {
  if (offset + 8 > view.byteLength) return null;
  const numerator = view.getUint32(offset, littleEndian);
  const denominator = view.getUint32(offset + 4, littleEndian);
  if (denominator === 0) return null;
  return numerator / denominator;
};

const byteSizeForType = (fieldType: number): number => {
  switch (fieldType) {
    case 1:
    case 2:
    case 7:
      return 1;
    case 3:
      return 2;
    case 4:
      return 4;
    case 5:
      return 8;
    default:
      return 0;
  }
};

const decodeTagValue = (
  view: DataView,
  tiffStart: number,
  fieldType: number,
  count: number,
  valueOffsetPos: number,
  littleEndian: boolean
): string | number | number[] | null => {
  const bytesPerValue = byteSizeForType(fieldType);
  if (bytesPerValue === 0 || count <= 0) return null;

  const byteLength = bytesPerValue * count;
  const valueOffset = byteLength <= 4 ? valueOffsetPos : tiffStart + view.getUint32(valueOffsetPos, littleEndian);
  if (valueOffset < 0 || valueOffset + byteLength > view.byteLength) return null;

  if (fieldType === 2) return readAscii(view, valueOffset, count);
  if (fieldType === 3 && count === 1) return view.getUint16(valueOffset, littleEndian);
  if (fieldType === 4 && count === 1) return view.getUint32(valueOffset, littleEndian);

  if (fieldType === 5 && count >= 1) {
    if (count === 1) return parseRational(view, valueOffset, littleEndian);
    const values: number[] = [];
    for (let index = 0; index < count; index += 1) {
      const parsed = parseRational(view, valueOffset + index * 8, littleEndian);
      if (parsed === null) return null;
      values.push(parsed);
    }
    return values;
  }

  return null;
};

const parseIfd = (view: DataView, tiffStart: number, ifdOffset: number, littleEndian: boolean): Map<number, string | number | number[] | null> => {
  const tags = new Map<number, string | number | number[] | null>();
  const ifdStart = tiffStart + ifdOffset;
  if (ifdStart + 2 > view.byteLength) return tags;

  const count = view.getUint16(ifdStart, littleEndian);
  for (let index = 0; index < count; index += 1) {
    const entryOffset = ifdStart + 2 + index * 12;
    if (entryOffset + 12 > view.byteLength) break;

    const tag = view.getUint16(entryOffset, littleEndian);
    const fieldType = view.getUint16(entryOffset + 2, littleEndian);
    const valueCount = view.getUint32(entryOffset + 4, littleEndian);
    tags.set(tag, decodeTagValue(view, tiffStart, fieldType, valueCount, entryOffset + 8, littleEndian));
  }

  return tags;
};

const asText = (value: string | number | number[] | null | undefined): string | undefined =>
  typeof value === 'string' && value ? value : undefined;

const asNumber = (value: string | number | number[] | null | undefined): number | undefined =>
  typeof value === 'number' ? value : undefined;

const asNumberArray = (value: string | number | number[] | null | undefined): number[] | null => {
  if (!Array.isArray(value)) return null;
  return value.every((item) => typeof item === 'number') ? value : null;
};

const toDecimalDegrees = (parts: number[] | null, ref: string | undefined): number | undefined => {
  if (!parts || parts.length < 3) return undefined;
  const sign = ref === 'S' || ref === 'W' ? -1 : 1;
  return sign * (parts[0] + parts[1] / 60 + parts[2] / 3600);
};

export const parseExifFromJpeg = (buffer: ArrayBuffer): ParsedExif | null => {
  const view = new DataView(buffer);
  const exifSegment = findJpegSegments(view).find((segment) => segment.marker === EXIF_MARKER);
  if (!exifSegment) return null;

  const exifHeaderOffset = exifSegment.start + 4;
  const exifHeader = readAscii(view, exifHeaderOffset, 6);
  if (!exifHeader.startsWith('Exif')) return null;

  const tiffStart = exifHeaderOffset + 6;
  const littleEndian = view.getUint16(tiffStart) === 0x4949;
  const ifd0Offset = view.getUint32(tiffStart + 4, littleEndian);

  const ifd0 = parseIfd(view, tiffStart, ifd0Offset, littleEndian);
  const parsed: ParsedExif = {
    make: asText(ifd0.get(0x010f)),
    model: asText(ifd0.get(0x0110)),
    software: asText(ifd0.get(0x0131)),
    dateTime: asText(ifd0.get(0x0132))
  };

  const exifOffset = asNumber(ifd0.get(0x8769));
  if (exifOffset !== undefined) {
    const exif = parseIfd(view, tiffStart, exifOffset, littleEndian);
    parsed.dateTimeOriginal = asText(exif.get(0x9003));
    parsed.iso = asNumber(exif.get(0x8827));
    const exposure = asNumber(exif.get(0x829a));
    if (exposure !== undefined) parsed.exposureTime = `${exposure.toFixed(6)}s`;
    parsed.fNumber = asNumber(exif.get(0x829d));
    parsed.focalLength = asNumber(exif.get(0x920a));
    parsed.pixelWidth = asNumber(exif.get(0xa002));
    parsed.pixelHeight = asNumber(exif.get(0xa003));
  }

  const gpsOffset = asNumber(ifd0.get(0x8825));
  if (gpsOffset !== undefined) {
    const gps = parseIfd(view, tiffStart, gpsOffset, littleEndian);
    parsed.gpsLatitude = toDecimalDegrees(asNumberArray(gps.get(0x0002)), asText(gps.get(0x0001)));
    parsed.gpsLongitude = toDecimalDegrees(asNumberArray(gps.get(0x0004)), asText(gps.get(0x0003)));
  }

  return parsed;
};
