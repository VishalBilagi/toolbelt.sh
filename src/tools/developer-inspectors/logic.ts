export interface DataUrlEncodeOptions {
  mimeType?: string;
  base64?: boolean;
}

export interface ParsedDataUrl {
  mimeType: string;
  charset: string | null;
  isBase64: boolean;
  encodedData: string;
  bytes: Uint8Array;
}

export type MimeConfidence = 'high' | 'medium' | 'low';

export interface MimeEvidence {
  source: 'signature' | 'extension' | 'declared' | 'data-url';
  mimeType: string;
  detail: string;
  confidence: MimeConfidence;
}

export interface MimeInspectionInput {
  fileName?: string;
  bytes?: Uint8Array;
  declaredMimeType?: string;
  dataUrl?: string;
}

export interface MimeInspectionResult {
  mimeType: string;
  confidence: MimeConfidence;
  extension: string | null;
  hexSignature: string;
  evidences: MimeEvidence[];
  notes: string[];
}

export type PageAssetKind =
  | 'script'
  | 'stylesheet'
  | 'image'
  | 'font'
  | 'video'
  | 'audio'
  | 'document'
  | 'icon'
  | 'manifest'
  | 'data'
  | 'other';

export interface PageAssetRecord {
  url: string;
  originalUrl: string;
  tag: string;
  attribute: 'src' | 'href' | 'srcset' | 'poster';
  kind: PageAssetKind;
  isInline: boolean;
  mimeType: string | null;
  sizeBytes: number | null;
}

export interface PageAssetKindSummary {
  kind: PageAssetKind;
  count: number;
  totalSizeBytes: number;
  unknownSizeCount: number;
}

export interface PageAssetSummary {
  assets: PageAssetRecord[];
  totalAssets: number;
  uniqueAssetCount: number;
  duplicateAssetCount: number;
  knownSizeBytes: number;
  unknownSizeCount: number;
  kindBreakdown: PageAssetKindSummary[];
}

interface SignatureRule {
  mimeType: string;
  detail: string;
  test: (bytes: Uint8Array) => boolean;
}

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const base64ToBytes = (value: string): Uint8Array => {
  const normalized = value.replace(/\s+/g, '');
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

const percentEncodedToBytes = (value: string): Uint8Array => {
  try {
    const decoded = decodeURIComponent(value);
    return new TextEncoder().encode(decoded);
  } catch {
    throw new Error('Invalid percent-encoded Data URL payload.');
  }
};

export const bytesToDataUrl = (bytes: Uint8Array, options: DataUrlEncodeOptions = {}): string => {
  const mimeType = (options.mimeType ?? 'application/octet-stream').trim() || 'application/octet-stream';
  const useBase64 = options.base64 !== false;

  if (useBase64) {
    return `data:${mimeType};base64,${bytesToBase64(bytes)}`;
  }

  const encoded = encodeURIComponent(new TextDecoder().decode(bytes));
  return `data:${mimeType},${encoded}`;
};

export const parseDataUrl = (value: string): ParsedDataUrl => {
  const trimmed = value.trim();
  const match = trimmed.match(/^data:([^,]*),(.*)$/s);
  if (!match) {
    throw new Error('Invalid Data URL. Expected format: data:[mime][;base64],payload');
  }

  const metadata = match[1] ?? '';
  const encodedData = match[2] ?? '';
  const parts = metadata.split(';').filter(Boolean);

  let mimeType = 'text/plain';
  let charset: string | null = null;
  let isBase64 = false;

  if (parts[0]?.includes('/')) {
    mimeType = parts.shift()?.toLowerCase() ?? mimeType;
  }

  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === 'base64') {
      isBase64 = true;
      continue;
    }
    if (lower.startsWith('charset=')) {
      charset = part.slice('charset='.length) || null;
    }
  }

  const bytes = isBase64 ? base64ToBytes(encodedData) : percentEncodedToBytes(encodedData);

  return {
    mimeType,
    charset,
    isBase64,
    encodedData,
    bytes
  };
};

export const dataUrlToText = (value: string): string => {
  const parsed = parseDataUrl(value);
  return new TextDecoder().decode(parsed.bytes);
};

const EXTENSION_MIME_MAP: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  avif: 'image/avif',
  pdf: 'application/pdf',
  json: 'application/json',
  txt: 'text/plain',
  html: 'text/html',
  css: 'text/css',
  js: 'text/javascript',
  mjs: 'text/javascript',
  ts: 'text/plain',
  zip: 'application/zip',
  gz: 'application/gzip',
  tar: 'application/x-tar',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  mp4: 'video/mp4',
  webm: 'video/webm',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  eot: 'application/vnd.ms-fontobject'
};

const hasBytesAt = (bytes: Uint8Array, signature: number[], offset = 0): boolean => {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((value, index) => bytes[offset + index] === value);
};

const signatureRules: SignatureRule[] = [
  {
    mimeType: 'image/png',
    detail: 'PNG signature (89 50 4E 47 0D 0A 1A 0A)',
    test: (bytes) => hasBytesAt(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  },
  {
    mimeType: 'image/jpeg',
    detail: 'JPEG signature (FF D8 FF)',
    test: (bytes) => hasBytesAt(bytes, [0xff, 0xd8, 0xff])
  },
  {
    mimeType: 'image/gif',
    detail: 'GIF signature (GIF87a/GIF89a)',
    test: (bytes) =>
      hasBytesAt(bytes, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) ||
      hasBytesAt(bytes, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
  },
  {
    mimeType: 'image/webp',
    detail: 'RIFF...WEBP container',
    test: (bytes) =>
      hasBytesAt(bytes, [0x52, 0x49, 0x46, 0x46]) && hasBytesAt(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  },
  {
    mimeType: 'application/pdf',
    detail: '%PDF- header',
    test: (bytes) => hasBytesAt(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])
  },
  {
    mimeType: 'application/zip',
    detail: 'ZIP local file header (PK..)',
    test: (bytes) => hasBytesAt(bytes, [0x50, 0x4b, 0x03, 0x04])
  },
  {
    mimeType: 'application/gzip',
    detail: 'GZIP signature (1F 8B)',
    test: (bytes) => hasBytesAt(bytes, [0x1f, 0x8b])
  },
  {
    mimeType: 'audio/mpeg',
    detail: 'MP3 ID3 tag',
    test: (bytes) => hasBytesAt(bytes, [0x49, 0x44, 0x33])
  },
  {
    mimeType: 'audio/wav',
    detail: 'RIFF...WAVE container',
    test: (bytes) =>
      hasBytesAt(bytes, [0x52, 0x49, 0x46, 0x46]) && hasBytesAt(bytes, [0x57, 0x41, 0x56, 0x45], 8)
  },
  {
    mimeType: 'video/mp4',
    detail: 'MP4 ftyp box',
    test: (bytes) => hasBytesAt(bytes, [0x66, 0x74, 0x79, 0x70], 4)
  },
  {
    mimeType: 'image/x-icon',
    detail: 'ICO header (00 00 01 00)',
    test: (bytes) => hasBytesAt(bytes, [0x00, 0x00, 0x01, 0x00])
  }
];

const extractFileExtension = (fileName: string | undefined): string | null => {
  if (!fileName) return null;
  const match = fileName.trim().toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : null;
};

const formatHexSignature = (bytes: Uint8Array | undefined, maxBytes = 16): string => {
  if (!bytes?.length) return 'No bytes available';
  return Array.from(bytes.slice(0, maxBytes))
    .map((byte) => byte.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
};

const detectSignatureEvidence = (bytes: Uint8Array | undefined): MimeEvidence | null => {
  if (!bytes?.length) return null;
  const rule = signatureRules.find((candidate) => candidate.test(bytes));
  if (!rule) return null;

  return {
    source: 'signature',
    mimeType: rule.mimeType,
    detail: rule.detail,
    confidence: 'high'
  };
};

export const inspectMime = (input: MimeInspectionInput): MimeInspectionResult => {
  const evidences: MimeEvidence[] = [];
  const notes: string[] = [];
  let bytes = input.bytes;
  let declaredMimeType = input.declaredMimeType?.trim().toLowerCase() || '';

  if (input.dataUrl?.trim()) {
    const parsed = parseDataUrl(input.dataUrl);
    bytes = bytes ?? parsed.bytes;
    if (!declaredMimeType) declaredMimeType = parsed.mimeType;
    evidences.push({
      source: 'data-url',
      mimeType: parsed.mimeType,
      detail: parsed.isBase64 ? 'Data URL metadata declares base64 payload.' : 'Data URL metadata declares percent-encoded payload.',
      confidence: 'medium'
    });
  }

  const extension = extractFileExtension(input.fileName);
  if (extension && EXTENSION_MIME_MAP[extension]) {
    evidences.push({
      source: 'extension',
      mimeType: EXTENSION_MIME_MAP[extension],
      detail: `Extension .${extension}`,
      confidence: 'low'
    });
  } else if (extension) {
    evidences.push({
      source: 'extension',
      mimeType: 'application/octet-stream',
      detail: `Unknown extension .${extension}`,
      confidence: 'low'
    });
  }

  if (declaredMimeType) {
    evidences.push({
      source: input.dataUrl ? 'data-url' : 'declared',
      mimeType: declaredMimeType,
      detail: 'Provided MIME type value.',
      confidence: 'medium'
    });
  }

  const signatureEvidence = detectSignatureEvidence(bytes);
  if (signatureEvidence) evidences.unshift(signatureEvidence);

  const signatureMime = signatureEvidence?.mimeType ?? null;
  const extensionMime = evidences.find((evidence) => evidence.source === 'extension')?.mimeType ?? null;
  const declaredMime = evidences.find((evidence) => evidence.source === 'declared' || evidence.source === 'data-url')?.mimeType ?? null;

  if (signatureMime && extensionMime && signatureMime !== extensionMime && extensionMime !== 'application/octet-stream') {
    notes.push(`Signature suggests ${signatureMime}, but extension suggests ${extensionMime}.`);
  }
  if (signatureMime && declaredMime && signatureMime !== declaredMime) {
    notes.push(`Signature suggests ${signatureMime}, but declared MIME type is ${declaredMime}.`);
  }

  let mimeType = 'application/octet-stream';
  let confidence: MimeConfidence = 'low';
  if (signatureMime) {
    mimeType = signatureMime;
    confidence = notes.length ? 'medium' : 'high';
  } else if (declaredMime) {
    mimeType = declaredMime;
    confidence = 'medium';
  } else if (extensionMime) {
    mimeType = extensionMime;
    confidence = extensionMime === 'application/octet-stream' ? 'low' : 'low';
  } else {
    notes.push('No extension, signature, or declared MIME metadata available. Falling back to application/octet-stream.');
  }

  return {
    mimeType,
    confidence,
    extension,
    hexSignature: formatHexSignature(bytes),
    evidences,
    notes
  };
};

const readAttr = (tagMarkup: string, attribute: string): string | null => {
  const pattern = new RegExp(`${attribute}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>"']+))`, 'i');
  const match = tagMarkup.match(pattern);
  if (!match) return null;
  return (match[1] ?? match[2] ?? match[3] ?? '').trim();
};

const parseSrcset = (value: string | null): string[] => {
  if (!value) return [];
  const urls: string[] = [];
  const pattern = /\s*(data:[^\s]+|[^,\s]+)(?:\s+[^,]+)?\s*(?:,|$)/gy;
  let match = pattern.exec(value);
  while (match) {
    const candidate = (match[1] ?? '').trim();
    if (candidate) urls.push(candidate);
    match = pattern.exec(value);
  }
  return urls;
};

const normalizeAssetUrl = (rawUrl: string, baseUrl?: string): string | null => {
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  if (/^javascript:/i.test(trimmed)) return null;
  if (/^data:/i.test(trimmed)) return trimmed;

  if (!baseUrl) return trimmed;

  try {
    return new URL(trimmed, baseUrl).toString();
  } catch {
    return trimmed;
  }
};

const inferMimeFromExtension = (url: string): string | null => {
  if (/^data:/i.test(url)) {
    try {
      return parseDataUrl(url).mimeType;
    } catch {
      return null;
    }
  }

  const withoutQuery = url.split('#')[0]?.split('?')[0] ?? url;
  const extension = extractFileExtension(withoutQuery);
  if (!extension) return null;
  return EXTENSION_MIME_MAP[extension] ?? null;
};

const kindFromMime = (mimeType: string | null): PageAssetKind | null => {
  if (!mimeType) return null;
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('font/')) return 'font';
  if (mimeType === 'text/css') return 'stylesheet';
  if (mimeType === 'application/manifest+json') return 'manifest';
  if (mimeType === 'application/json') return 'data';
  if (mimeType === 'text/javascript' || mimeType === 'application/javascript') return 'script';
  return null;
};

const classifyAssetKind = (tag: string, attribute: PageAssetRecord['attribute'], tagMarkup: string, url: string): PageAssetKind => {
  const rel = (readAttr(tagMarkup, 'rel') ?? '').toLowerCase();
  const asValue = (readAttr(tagMarkup, 'as') ?? '').toLowerCase();
  const typeAttr = (readAttr(tagMarkup, 'type') ?? '').toLowerCase();
  const inferredMime = inferMimeFromExtension(url) ?? (typeAttr || null);

  if (tag === 'script') return 'script';
  if (tag === 'img') return 'image';
  if (tag === 'video') return attribute === 'poster' ? 'image' : 'video';
  if (tag === 'audio') return 'audio';
  if (tag === 'iframe') return 'document';

  if (tag === 'source') {
    const fromMime = kindFromMime(inferredMime);
    return fromMime ?? 'image';
  }

  if (tag === 'link') {
    if (rel.includes('stylesheet')) return 'stylesheet';
    if (rel.includes('icon')) return 'icon';
    if (rel.includes('manifest')) return 'manifest';
    if (rel.includes('preload') || rel.includes('prefetch')) {
      if (asValue === 'font') return 'font';
      if (asValue === 'script') return 'script';
      if (asValue === 'style') return 'stylesheet';
      if (asValue === 'image') return 'image';
      if (asValue === 'fetch') return 'data';
    }
  }

  const byMime = kindFromMime(inferredMime);
  return byMime ?? 'other';
};

const dataUrlSize = (url: string): number | null => {
  if (!/^data:/i.test(url)) return null;
  try {
    return parseDataUrl(url).bytes.length;
  } catch {
    return null;
  }
};

const appendAsset = (
  assets: PageAssetRecord[],
  tag: string,
  tagMarkup: string,
  attribute: PageAssetRecord['attribute'],
  rawUrl: string,
  baseUrl?: string
) => {
  const normalizedUrl = normalizeAssetUrl(rawUrl, baseUrl);
  if (!normalizedUrl) return;

  const mimeType = inferMimeFromExtension(normalizedUrl);
  assets.push({
    url: normalizedUrl,
    originalUrl: rawUrl,
    tag,
    attribute,
    kind: classifyAssetKind(tag, attribute, tagMarkup, normalizedUrl),
    isInline: /^data:/i.test(normalizedUrl),
    mimeType,
    sizeBytes: dataUrlSize(normalizedUrl)
  });
};

export const extractPageAssets = (html: string, baseUrl?: string): PageAssetRecord[] => {
  const assets: PageAssetRecord[] = [];
  const tagPattern = /<(img|script|link|source|video|audio|iframe)\b[^>]*>/gi;

  let match = tagPattern.exec(html);
  while (match) {
    const tag = (match[1] ?? '').toLowerCase();
    const tagMarkup = match[0] ?? '';

    if (tag === 'script') {
      const src = readAttr(tagMarkup, 'src');
      if (src) appendAsset(assets, tag, tagMarkup, 'src', src, baseUrl);
    } else if (tag === 'img') {
      const src = readAttr(tagMarkup, 'src');
      const srcset = readAttr(tagMarkup, 'srcset');
      if (src) appendAsset(assets, tag, tagMarkup, 'src', src, baseUrl);
      for (const url of parseSrcset(srcset)) appendAsset(assets, tag, tagMarkup, 'srcset', url, baseUrl);
    } else if (tag === 'link') {
      const href = readAttr(tagMarkup, 'href');
      if (href) appendAsset(assets, tag, tagMarkup, 'href', href, baseUrl);
    } else if (tag === 'source') {
      const src = readAttr(tagMarkup, 'src');
      const srcset = readAttr(tagMarkup, 'srcset');
      if (src) appendAsset(assets, tag, tagMarkup, 'src', src, baseUrl);
      for (const url of parseSrcset(srcset)) appendAsset(assets, tag, tagMarkup, 'srcset', url, baseUrl);
    } else if (tag === 'video') {
      const src = readAttr(tagMarkup, 'src');
      const poster = readAttr(tagMarkup, 'poster');
      if (src) appendAsset(assets, tag, tagMarkup, 'src', src, baseUrl);
      if (poster) appendAsset(assets, tag, tagMarkup, 'poster', poster, baseUrl);
    } else if (tag === 'audio' || tag === 'iframe') {
      const src = readAttr(tagMarkup, 'src');
      if (src) appendAsset(assets, tag, tagMarkup, 'src', src, baseUrl);
    }

    match = tagPattern.exec(html);
  }

  return assets;
};

export const applyAssetSizeHints = (
  assets: PageAssetRecord[],
  sizeHints: Record<string, number | null | undefined>
): PageAssetRecord[] =>
  assets.map((asset) => {
    const hintedSize = sizeHints[asset.url];
    if (typeof hintedSize !== 'number' || !Number.isFinite(hintedSize) || hintedSize < 0) return asset;
    return { ...asset, sizeBytes: asset.sizeBytes ?? hintedSize };
  });

export const summarizePageAssets = (assets: PageAssetRecord[]): PageAssetSummary => {
  const kindMap = new Map<PageAssetKind, PageAssetKindSummary>();
  const uniqueUrls = new Set<string>();
  let knownSizeBytes = 0;
  let unknownSizeCount = 0;

  for (const asset of assets) {
    uniqueUrls.add(asset.url);
    const current =
      kindMap.get(asset.kind) ??
      ({
        kind: asset.kind,
        count: 0,
        totalSizeBytes: 0,
        unknownSizeCount: 0
      } satisfies PageAssetKindSummary);

    current.count += 1;
    if (typeof asset.sizeBytes === 'number') {
      current.totalSizeBytes += asset.sizeBytes;
      knownSizeBytes += asset.sizeBytes;
    } else {
      current.unknownSizeCount += 1;
      unknownSizeCount += 1;
    }

    kindMap.set(asset.kind, current);
  }

  const kindBreakdown = Array.from(kindMap.values()).sort((left, right) => {
    if (right.totalSizeBytes !== left.totalSizeBytes) return right.totalSizeBytes - left.totalSizeBytes;
    if (right.count !== left.count) return right.count - left.count;
    return left.kind.localeCompare(right.kind);
  });

  return {
    assets,
    totalAssets: assets.length,
    uniqueAssetCount: uniqueUrls.size,
    duplicateAssetCount: Math.max(0, assets.length - uniqueUrls.size),
    knownSizeBytes,
    unknownSizeCount,
    kindBreakdown
  };
};
