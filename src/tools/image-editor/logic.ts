export type ImageFormat = 'png' | 'jpeg' | 'webp' | 'avif';

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const MIME_BY_FORMAT: Record<ImageFormat, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  avif: 'image/avif'
};

export const clampDimension = (value: number, max: number): number => {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(Math.round(value), Math.max(1, Math.round(max))));
};

export const normalizeCropRect = (
  crop: CropRect,
  sourceWidth: number,
  sourceHeight: number
): CropRect => {
  const safeSourceWidth = Math.max(1, Math.round(sourceWidth));
  const safeSourceHeight = Math.max(1, Math.round(sourceHeight));

  const width = clampDimension(crop.width, safeSourceWidth);
  const height = clampDimension(crop.height, safeSourceHeight);

  const maxX = Math.max(0, safeSourceWidth - width);
  const maxY = Math.max(0, safeSourceHeight - height);

  const x = Math.max(0, Math.min(Math.round(crop.x), maxX));
  const y = Math.max(0, Math.min(Math.round(crop.y), maxY));

  return { x, y, width, height };
};

export const deriveLockedHeight = (
  width: number,
  aspectRatio: number,
  maxHeight: number
): number => {
  if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) return clampDimension(width, maxHeight);
  return clampDimension(width / aspectRatio, maxHeight);
};

export const deriveLockedWidth = (
  height: number,
  aspectRatio: number,
  maxWidth: number
): number => {
  if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) return clampDimension(height, maxWidth);
  return clampDimension(height * aspectRatio, maxWidth);
};

export const getExportFormatWithFallback = (
  requested: ImageFormat,
  supportMap: Record<ImageFormat, boolean>
): ImageFormat => {
  if (supportMap[requested]) return requested;
  if (supportMap.png) return 'png';
  if (supportMap.jpeg) return 'jpeg';
  if (supportMap.webp) return 'webp';
  return 'avif';
};
