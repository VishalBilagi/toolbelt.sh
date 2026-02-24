export type DimensionSource = 'viewBox' | 'attributes';

export interface SvgViewBox {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

export interface ParsedSvgDimensions {
  width: number;
  height: number;
  aspectRatio: number;
  source: DimensionSource;
  viewBox: SvgViewBox | null;
}

export interface OutputGuardrailResult {
  width: number;
  height: number;
  megapixels: number;
  blocking: string[];
  warnings: string[];
}

export const MAX_OUTPUT_DIMENSION = 8192;
export const WARNING_MEGAPIXELS = 25;

const SVG_OPEN_TAG_RE = /<svg\b[^>]*>/i;

const parseAttribute = (svgText: string, attrName: string): string | null => {
  const pattern = new RegExp(`${attrName}\\s*=\\s*(['"])(.*?)\\1`, 'i');
  const match = svgText.match(pattern);
  return match?.[2] ?? null;
};

const parseNumericLength = (raw: string | null): number | null => {
  if (!raw) return null;
  const value = raw.trim();
  if (!value) return null;

  const match = value.match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*(px)?$/i);
  if (!match) return null;

  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

export const parseViewBox = (raw: string | null): SvgViewBox | null => {
  if (!raw) return null;
  const tokens = raw
    .trim()
    .split(/[\s,]+/)
    .map((token) => Number(token));

  if (tokens.length !== 4 || tokens.some((token) => !Number.isFinite(token))) {
    return null;
  }

  const [minX, minY, width, height] = tokens;
  if (width <= 0 || height <= 0) return null;

  return { minX, minY, width, height };
};

export const parseSvgDimensions = (svgText: string): ParsedSvgDimensions => {
  const svgTag = svgText.match(SVG_OPEN_TAG_RE)?.[0];
  if (!svgTag) {
    throw new Error('Invalid SVG: missing <svg> root element.');
  }

  const viewBox = parseViewBox(parseAttribute(svgTag, 'viewBox'));
  if (viewBox) {
    return {
      width: viewBox.width,
      height: viewBox.height,
      aspectRatio: viewBox.width / viewBox.height,
      source: 'viewBox',
      viewBox
    };
  }

  const width = parseNumericLength(parseAttribute(svgTag, 'width'));
  const height = parseNumericLength(parseAttribute(svgTag, 'height'));

  if (!width || !height) {
    throw new Error('Could not read SVG dimensions. Add a viewBox or numeric width/height attributes.');
  }

  return {
    width,
    height,
    aspectRatio: width / height,
    source: 'attributes',
    viewBox: null
  };
};

export const roundPixelDimension = (value: number): number => {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.round(value));
};

export const clampScale = (value: number, min = 0.1, max = 10): number => {
  if (!Number.isFinite(value)) return 1;
  return Math.min(max, Math.max(min, value));
};

export const deriveSizeFromScale = (
  originalWidth: number,
  originalHeight: number,
  scale: number
): { width: number; height: number; scale: number } => {
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const width = roundPixelDimension(originalWidth * safeScale);
  const height = roundPixelDimension(originalHeight * safeScale);
  return {
    width,
    height,
    scale: width / originalWidth
  };
};

export const deriveSizeFromWidth = (
  originalWidth: number,
  originalHeight: number,
  nextWidth: number
): { width: number; height: number; scale: number } => {
  const width = roundPixelDimension(nextWidth);
  const height = roundPixelDimension((width / originalWidth) * originalHeight);
  return { width, height, scale: width / originalWidth };
};

export const deriveSizeFromHeight = (
  originalWidth: number,
  originalHeight: number,
  nextHeight: number
): { width: number; height: number; scale: number } => {
  const height = roundPixelDimension(nextHeight);
  const width = roundPixelDimension((height / originalHeight) * originalWidth);
  return { width, height, scale: width / originalWidth };
};

export const evaluateOutputGuardrails = (width: number, height: number): OutputGuardrailResult => {
  const safeWidth = roundPixelDimension(width);
  const safeHeight = roundPixelDimension(height);
  const blocking: string[] = [];
  const warnings: string[] = [];

  if (safeWidth > MAX_OUTPUT_DIMENSION || safeHeight > MAX_OUTPUT_DIMENSION) {
    blocking.push(`Max output dimension is ${MAX_OUTPUT_DIMENSION}px.`);
  }

  const megapixels = (safeWidth * safeHeight) / 1_000_000;
  if (megapixels > WARNING_MEGAPIXELS) {
    warnings.push(`Large export (${formatMegapixels(megapixels)}). May be slow or fail in the browser.`);
  }

  return { width: safeWidth, height: safeHeight, megapixels, blocking, warnings };
};

const replaceOrInsertSvgAttribute = (svgTag: string, attrName: string, value: string): string => {
  const attrPattern = new RegExp(`(${attrName}\\s*=\\s*['"])([^'"]*)(['"])`, 'i');
  if (attrPattern.test(svgTag)) {
    return svgTag.replace(attrPattern, `$1${value}$3`);
  }

  const closeIndex = svgTag.endsWith('/>') ? svgTag.length - 2 : svgTag.length - 1;
  return `${svgTag.slice(0, closeIndex)} ${attrName}="${value}"${svgTag.slice(closeIndex)}`;
};

const formatSvgDimensionAttr = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) return '1';
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(4).replace(/\.?0+$/, '');
};

export const serializeSvgWithSize = (svgText: string, width: number, height: number): string => {
  const svgTagMatch = svgText.match(SVG_OPEN_TAG_RE);
  if (!svgTagMatch) {
    throw new Error('Invalid SVG: missing <svg> root element.');
  }

  let nextTag = svgTagMatch[0];
  nextTag = replaceOrInsertSvgAttribute(nextTag, 'width', formatSvgDimensionAttr(width));
  nextTag = replaceOrInsertSvgAttribute(nextTag, 'height', formatSvgDimensionAttr(height));

  return `${svgText.slice(0, svgTagMatch.index)}${nextTag}${svgText.slice((svgTagMatch.index ?? 0) + svgTagMatch[0].length)}`;
};

export const formatPixels = (value: number): string => `${roundPixelDimension(value)}px`;

export const formatPixelSize = (width: number, height: number): string =>
  `${roundPixelDimension(width)}x${roundPixelDimension(height)}`;

export const formatScaleRatio = (scale: number): string => `${(Number.isFinite(scale) ? scale : 1).toFixed(3).replace(/\.?0+$/, '')}x`;

export const formatPercent = (scale: number): string =>
  `${((Number.isFinite(scale) ? scale : 1) * 100).toFixed(2).replace(/\.?0+$/, '')}%`;

export const formatMegapixels = (value: number): string =>
  `${(Number.isFinite(value) ? value : 0).toFixed(2).replace(/\.?0+$/, '')} MP`;
