export interface QueryEntry {
  key: string;
  value: string;
}

export interface QueryParseResult {
  basePath: string;
  hash: string;
  entries: QueryEntry[];
}

export interface FormattedTimestamp {
  unix: number;
  iso: string;
  utc: string;
  local: string;
}

export interface DecodedJwt {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signature: string | null;
  timestamps: FormattedTimestampField[];
}

export interface FormattedTimestampField extends FormattedTimestamp {
  claim: 'iat' | 'exp' | 'nbf';
}

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (const value of bytes) binary += String.fromCharCode(value);
  return btoa(binary);
};

const base64ToBytes = (base64Value: string): Uint8Array => {
  const binary = atob(base64Value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

export const base64Encode = (value: string): string => bytesToBase64(new TextEncoder().encode(value));

export const base64Decode = (value: string): string => {
  const normalized = value.replace(/\s+/g, '');
  if (!normalized) return '';

  try {
    return new TextDecoder().decode(base64ToBytes(normalized));
  } catch {
    throw new Error('Invalid Base64 input.');
  }
};

export const urlEncode = (value: string): string => encodeURIComponent(value);

export const urlDecode = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new Error('Invalid URL encoded input.');
  }
};

const isLikelyAbsoluteUrl = (value: string): boolean => /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(value);

const parseRawQuery = (query: string): QueryEntry[] => {
  if (!query.trim()) return [];
  const searchParams = new URLSearchParams(query.startsWith('?') ? query.slice(1) : query);
  return Array.from(searchParams.entries()).map(([key, value]) => ({ key, value }));
};

export const parseQueryInput = (input: string): QueryParseResult => {
  const value = input.trim();
  if (!value) return { basePath: '', hash: '', entries: [] };

  if (isLikelyAbsoluteUrl(value)) {
    const url = new URL(value);
    return {
      basePath: `${url.origin}${url.pathname}`,
      hash: url.hash.replace(/^#/, ''),
      entries: parseRawQuery(url.search)
    };
  }

  if (value.includes('?')) {
    const [basePath, afterQuestion] = value.split(/\?(.*)/s);
    const [queryPart = '', hashPart = ''] = afterQuestion.split('#');
    return {
      basePath,
      hash: hashPart,
      entries: parseRawQuery(queryPart)
    };
  }

  if (value.startsWith('?') || value.includes('=') || value.includes('&')) {
    const [queryPart = '', hashPart = ''] = value.split('#');
    return {
      basePath: '',
      hash: hashPart,
      entries: parseRawQuery(queryPart)
    };
  }

  const [basePath, hash = ''] = value.split('#');
  return { basePath, hash, entries: [] };
};

export const buildQueryOutput = (basePath: string, entries: QueryEntry[], hash = ''): string => {
  const searchParams = new URLSearchParams();
  for (const entry of entries) {
    if (!entry.key && !entry.value) continue;
    searchParams.append(entry.key, entry.value);
  }

  const query = searchParams.toString();
  const normalizedHash = hash.replace(/^#/, '').trim();

  if (isLikelyAbsoluteUrl(basePath)) {
    const url = new URL(basePath);
    url.search = query ? `?${query}` : '';
    url.hash = normalizedHash ? `#${normalizedHash}` : '';
    return url.toString();
  }

  let output = basePath.trim();
  if (query) output += `?${query}`;
  if (normalizedHash) output += `#${normalizedHash}`;

  return output || (query ? `?${query}` : normalizedHash ? `#${normalizedHash}` : '');
};

const decodeBase64Url = (value: string): string => {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  return new TextDecoder().decode(base64ToBytes(padded));
};

const asTimestampClaim = (claim: string): claim is 'iat' | 'exp' | 'nbf' =>
  claim === 'iat' || claim === 'exp' || claim === 'nbf';

export const formatUnixTimestamp = (unixSeconds: number): FormattedTimestamp => {
  const date = new Date(unixSeconds * 1000);
  if (!Number.isFinite(date.getTime())) {
    throw new Error('Invalid timestamp.');
  }

  return {
    unix: unixSeconds,
    iso: date.toISOString(),
    utc: date.toUTCString(),
    local: date.toLocaleString()
  };
};

export const decodeJwt = (token: string): DecodedJwt => {
  const trimmed = token.trim();
  const segments = trimmed.split('.');
  if (segments.length < 2) {
    throw new Error('JWT must include header and payload segments.');
  }

  try {
    const header = JSON.parse(decodeBase64Url(segments[0])) as Record<string, unknown>;
    const payload = JSON.parse(decodeBase64Url(segments[1])) as Record<string, unknown>;
    const signature = segments[2] || null;

    const timestamps: FormattedTimestampField[] = [];
    for (const claim of ['iat', 'exp', 'nbf'] as const) {
      const value = payload[claim];
      if (typeof value === 'number') {
        timestamps.push({ claim, ...formatUnixTimestamp(value) });
      } else if (typeof value === 'string' && /^\d+$/.test(value) && asTimestampClaim(claim)) {
        timestamps.push({ claim, ...formatUnixTimestamp(Number(value)) });
      }
    }

    return { header, payload, signature, timestamps };
  } catch {
    throw new Error('Invalid JWT encoding or JSON payload.');
  }
};
