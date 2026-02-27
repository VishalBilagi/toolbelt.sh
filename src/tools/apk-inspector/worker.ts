import JSZip from 'jszip';

import { buildFileTree, pickLargestEntries, summarizeByTopLevelFolder, type ApkFileEntry, type SizeBucket, type TreeNode } from './logic';

interface ManifestSummary {
  packageName: string;
  versionName: string;
  versionCode: string;
  minSdk: string;
  targetSdk: string;
  appLabel: string;
  permissions: string[];
  components: {
    activities: number;
    services: number;
    receivers: number;
    providers: number;
  };
  rawManifest: string;
}

interface SigningInfo {
  schemes: string[];
  fingerprints: string[];
  certEntries: string[];
}

interface ParsedApkResult {
  fileName: string;
  totalSize: number;
  overview: ManifestSummary & { abis: string[] };
  signing: SigningInfo;
  files: {
    entries: ApkFileEntry[];
    tree: TreeNode[];
    folderSummary: SizeBucket[];
    largest: ApkFileEntry[];
  };
}

interface ParseMessage {
  type: 'parse';
  fileName: string;
  arrayBuffer: ArrayBuffer;
}

interface BinaryXmlAttribute {
  name: string;
  value: string;
}

interface BinaryXmlNode {
  name: string;
  attributes: BinaryXmlAttribute[];
}

interface BinaryXmlManifest {
  xmlText: string;
  nodes: BinaryXmlNode[];
}

const CHUNK_XML = 0x0003;
const CHUNK_STRING_POOL = 0x0001;
const CHUNK_RESOURCE_MAP = 0x0180;
const CHUNK_START_ELEMENT = 0x0102;
const CHUNK_END_ELEMENT = 0x0103;
const UTF8_FLAG = 0x0100;

const VALUE_TYPE_STRING = 0x03;
const VALUE_TYPE_INT_DEC = 0x10;
const VALUE_TYPE_INT_HEX = 0x11;
const VALUE_TYPE_INT_BOOLEAN = 0x12;
const VALUE_TYPE_REFERENCE = 0x01;

const UNKNOWN_VALUE = 'Not found';

const ANDROID_RESOURCE_NAMES: Record<number, string> = {
  0x01010003: 'label',
  0x0101021b: 'versionCode',
  0x0101021c: 'versionName',
  0x01010270: 'minSdkVersion',
  0x01010271: 'targetSdkVersion',
  0x01010001: 'name'
};

const safeString = (value: string | undefined): string => (value && value.trim() ? value : UNKNOWN_VALUE);

const readUtf8Length = (buffer: Uint8Array, offset: number): { value: number; bytes: number } => {
  const first = buffer[offset] ?? 0;
  if ((first & 0x80) === 0) {
    return { value: first, bytes: 1 };
  }

  const second = buffer[offset + 1] ?? 0;
  return { value: ((first & 0x7f) << 8) | second, bytes: 2 };
};

const readUtf16Length = (buffer: Uint8Array, offset: number): { value: number; bytes: number } => {
  const first = (buffer[offset] ?? 0) | ((buffer[offset + 1] ?? 0) << 8);
  if ((first & 0x8000) === 0) {
    return { value: first, bytes: 2 };
  }

  const second = (buffer[offset + 2] ?? 0) | ((buffer[offset + 3] ?? 0) << 8);
  return { value: ((first & 0x7fff) << 16) | second, bytes: 4 };
};

const decodeStringPool = (
  bytes: Uint8Array,
  chunkOffset: number,
  chunkSize: number,
  stringCount: number,
  stringsStart: number,
  flags: number,
  dataView: DataView
): string[] => {
  const strings: string[] = [];
  const stringIndexOffset = chunkOffset + 0x1c;
  const utf8 = (flags & UTF8_FLAG) !== 0;

  for (let index = 0; index < stringCount; index += 1) {
    const relativeOffset = dataView.getUint32(stringIndexOffset + index * 4, true);
    const valueOffset = chunkOffset + stringsStart + relativeOffset;

    if (utf8) {
      const charLength = readUtf8Length(bytes, valueOffset);
      const byteLength = readUtf8Length(bytes, valueOffset + charLength.bytes);
      const start = valueOffset + charLength.bytes + byteLength.bytes;
      const end = Math.min(start + byteLength.value, chunkOffset + chunkSize);
      strings.push(new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(start, end)));
      continue;
    }

    const utf16Length = readUtf16Length(bytes, valueOffset);
    const start = valueOffset + utf16Length.bytes;
    const end = Math.min(start + utf16Length.value * 2, chunkOffset + chunkSize);
    strings.push(new TextDecoder('utf-16le', { fatal: false }).decode(bytes.slice(start, end)));
  }

  return strings;
};

const decodeTypedValue = (type: number, data: number, rawValue: string | undefined, strings: string[]): string => {
  if (rawValue) return rawValue;

  if (type === VALUE_TYPE_STRING) {
    return strings[data] ?? UNKNOWN_VALUE;
  }

  if (type === VALUE_TYPE_INT_DEC) {
    return String(data >>> 0);
  }

  if (type === VALUE_TYPE_INT_HEX) {
    return `0x${(data >>> 0).toString(16)}`;
  }

  if (type === VALUE_TYPE_INT_BOOLEAN) {
    return data !== 0 ? 'true' : 'false';
  }

  if (type === VALUE_TYPE_REFERENCE) {
    return `@0x${(data >>> 0).toString(16)}`;
  }

  return `0x${(data >>> 0).toString(16)}`;
};

const parseBinaryManifest = (bytes: Uint8Array): BinaryXmlManifest => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 8) throw new Error('Manifest payload too small.');

  const fileType = view.getUint16(0, true);
  if (fileType !== CHUNK_XML) {
    throw new Error('AndroidManifest.xml is not in binary XML format.');
  }

  let offset = 8;
  let strings: string[] = [];
  let resourceMap: number[] = [];
  const nodes: BinaryXmlNode[] = [];
  const lines: string[] = [];
  const stack: string[] = [];

  while (offset + 8 <= bytes.length) {
    const chunkType = view.getUint16(offset, true);
    const headerSize = view.getUint16(offset + 2, true);
    const chunkSize = view.getUint32(offset + 4, true);

    if (chunkSize < headerSize || chunkSize <= 0 || offset + chunkSize > bytes.length) break;

    if (chunkType === CHUNK_STRING_POOL) {
      const stringCount = view.getUint32(offset + 8, true);
      const flags = view.getUint32(offset + 16, true);
      const stringsStart = view.getUint32(offset + 20, true);
      strings = decodeStringPool(bytes, offset, chunkSize, stringCount, stringsStart, flags, view);
    }

    if (chunkType === CHUNK_RESOURCE_MAP) {
      resourceMap = [];
      for (let cursor = offset + headerSize; cursor + 4 <= offset + chunkSize; cursor += 4) {
        resourceMap.push(view.getUint32(cursor, true));
      }
    }

    if (chunkType === CHUNK_START_ELEMENT) {
      const nameIndex = view.getInt32(offset + 20, true);
      const name = strings[nameIndex] ?? `node_${nameIndex}`;
      const attributeStart = view.getUint16(offset + 24, true);
      const attributeSize = view.getUint16(offset + 26, true);
      const attributeCount = view.getUint16(offset + 28, true);

      const attributes: BinaryXmlAttribute[] = [];
      const attrBase = offset + attributeStart;

      for (let attrIndex = 0; attrIndex < attributeCount; attrIndex += 1) {
        const attrOffset = attrBase + attrIndex * attributeSize;
        if (attrOffset + 20 > offset + chunkSize) continue;

        const attrNameIndex = view.getInt32(attrOffset + 4, true);
        const rawValueIndex = view.getInt32(attrOffset + 8, true);
        const valueType = view.getUint8(attrOffset + 15);
        const valueData = view.getUint32(attrOffset + 16, true);

        const attrResourceId = attrNameIndex >= 0 ? resourceMap[attrNameIndex] : undefined;
        const fallbackName = attrResourceId ? ANDROID_RESOURCE_NAMES[attrResourceId] : undefined;
        const attrName = strings[attrNameIndex] ?? fallbackName ?? `attr_${attrNameIndex}`;
        const rawValue = rawValueIndex >= 0 ? strings[rawValueIndex] : undefined;
        const value = decodeTypedValue(valueType, valueData, rawValue, strings);

        attributes.push({ name: attrName, value });
      }

      nodes.push({ name, attributes });
      const attrsText = attributes.map((attribute) => `${attribute.name}="${attribute.value}"`).join(' ');
      const indent = '  '.repeat(stack.length);
      lines.push(`${indent}<${name}${attrsText ? ` ${attrsText}` : ''}>`);
      stack.push(name);
    }

    if (chunkType === CHUNK_END_ELEMENT) {
      const nameIndex = view.getInt32(offset + 20, true);
      const name = strings[nameIndex] ?? stack.pop() ?? 'node';
      const depth = Math.max(stack.length - 1, 0);
      const indent = '  '.repeat(depth);
      lines.push(`${indent}</${name}>`);
      if (stack[stack.length - 1] === name) {
        stack.pop();
      }
    }

    offset += chunkSize;
  }

  return {
    xmlText: lines.join('\n').slice(0, 220000),
    nodes
  };
};

const findAbis = (paths: string[]): string[] => {
  const abis = new Set<string>();
  for (const path of paths) {
    const match = path.match(/^lib\/([^/]+)\//);
    if (match?.[1]) abis.add(match[1]);
  }
  return [...abis].sort((a, b) => a.localeCompare(b));
};

const digestHex = async (content: Uint8Array): Promise<string> => {
  const hash = await crypto.subtle.digest('SHA-256', content);
  return [...new Uint8Array(hash)].map((value) => value.toString(16).padStart(2, '0')).join('');
};

const collectSigningInfo = async (zip: JSZip): Promise<SigningInfo> => {
  const certFileNames = Object.keys(zip.files).filter((path) => /^META-INF\/.*\.(RSA|DSA|EC|SF|MF)$/i.test(path));

  const schemeGuesses = new Set<string>();
  if (certFileNames.some((name) => name.endsWith('.MF') || name.endsWith('.SF'))) {
    schemeGuesses.add('v1 (JAR signature)');
  }

  if (Object.keys(zip.files).includes('META-INF/CERT.RSA')) {
    schemeGuesses.add('v1/v2 (possible)');
  }

  const fingerprints: string[] = [];
  for (const fileName of certFileNames) {
    const bytes = await zip.file(fileName)?.async('uint8array');
    if (!bytes) continue;
    fingerprints.push(`${fileName}: ${await digestHex(bytes)}`);
  }

  return { schemes: [...schemeGuesses], fingerprints, certEntries: certFileNames };
};

const pickManifestField = (attributes: BinaryXmlAttribute[], keys: string[]): string => {
  for (const key of keys) {
    const match = attributes.find((attribute) => attribute.name === key || attribute.name.endsWith(`:${key}`));
    if (match) return match.value;
  }
  return UNKNOWN_VALUE;
};

const decodeManifest = async (zip: JSZip): Promise<ManifestSummary> => {
  const manifestEntry = zip.file('AndroidManifest.xml');
  if (!manifestEntry) {
    return {
      packageName: UNKNOWN_VALUE,
      versionName: UNKNOWN_VALUE,
      versionCode: UNKNOWN_VALUE,
      minSdk: UNKNOWN_VALUE,
      targetSdk: UNKNOWN_VALUE,
      appLabel: UNKNOWN_VALUE,
      permissions: [],
      components: { activities: 0, services: 0, receivers: 0, providers: 0 },
      rawManifest: 'AndroidManifest.xml not found in archive.'
    };
  }

  const bytes = await manifestEntry.async('uint8array');

  try {
    const parsed = parseBinaryManifest(bytes);
    const manifestNode = parsed.nodes.find((node) => node.name === 'manifest');
    const sdkNode = parsed.nodes.find((node) => node.name === 'uses-sdk');
    const appNode = parsed.nodes.find((node) => node.name === 'application');

    const permissions = parsed.nodes
      .filter((node) => node.name === 'uses-permission' || node.name === 'uses-permission-sdk-23')
      .map((node) => pickManifestField(node.attributes, ['name']))
      .filter((value, index, list) => value !== UNKNOWN_VALUE && list.indexOf(value) === index)
      .sort((a, b) => a.localeCompare(b));

    return {
      packageName: safeString(pickManifestField(manifestNode?.attributes ?? [], ['package'])),
      versionName: safeString(pickManifestField(manifestNode?.attributes ?? [], ['versionName'])),
      versionCode: safeString(pickManifestField(manifestNode?.attributes ?? [], ['versionCode'])),
      minSdk: safeString(pickManifestField(sdkNode?.attributes ?? [], ['minSdkVersion'])),
      targetSdk: safeString(pickManifestField(sdkNode?.attributes ?? [], ['targetSdkVersion'])),
      appLabel: safeString(pickManifestField(appNode?.attributes ?? [], ['label'])),
      permissions,
      components: {
        activities: parsed.nodes.filter((node) => node.name === 'activity' || node.name === 'activity-alias').length,
        services: parsed.nodes.filter((node) => node.name === 'service').length,
        receivers: parsed.nodes.filter((node) => node.name === 'receiver').length,
        providers: parsed.nodes.filter((node) => node.name === 'provider').length
      },
      rawManifest: parsed.xmlText || 'Unable to render manifest preview.'
    };
  } catch {
    const merged = `${new TextDecoder('utf-8', { fatal: false }).decode(bytes)}\n${new TextDecoder('utf-16le', { fatal: false }).decode(bytes)}`;

    const readFallback = (key: string): string => {
      const patterns = [new RegExp(`${key}\\s*=\\s*"([^"]+)"`), new RegExp(`${key}\\s*=\\s*'([^']+)'`)];
      for (const pattern of patterns) {
        const match = merged.match(pattern);
        if (match?.[1]) return match[1];
      }
      return UNKNOWN_VALUE;
    };

    return {
      packageName: readFallback('package'),
      versionName: readFallback('versionName'),
      versionCode: readFallback('versionCode'),
      minSdk: readFallback('minSdkVersion'),
      targetSdk: readFallback('targetSdkVersion'),
      appLabel: readFallback('label'),
      permissions: [...new Set(Array.from(merged.matchAll(/android\.permission\.[A-Z0-9_]+/g)).map((match) => match[0]))],
      components: {
        activities: (merged.match(/<activity\b|activity-alias\b/g) ?? []).length,
        services: (merged.match(/<service\b/g) ?? []).length,
        receivers: (merged.match(/<receiver\b/g) ?? []).length,
        providers: (merged.match(/<provider\b/g) ?? []).length
      },
      rawManifest: merged.slice(0, 180000)
    };
  }
};

self.onmessage = async (event: MessageEvent<ParseMessage>) => {
  if (event.data.type !== 'parse') return;

  try {
    const zip = await JSZip.loadAsync(event.data.arrayBuffer);
    const entries: ApkFileEntry[] = Object.values(zip.files)
      .filter((entry) => !entry.dir)
      .map((entry) => ({ path: entry.name, size: entry._data.uncompressedSize ?? 0 }));

    const manifest = await decodeManifest(zip);
    const signing = await collectSigningInfo(zip);

    const result: ParsedApkResult = {
      fileName: event.data.fileName,
      totalSize: entries.reduce((sum, entry) => sum + entry.size, 0),
      overview: { ...manifest, abis: findAbis(entries.map((entry) => entry.path)) },
      signing,
      files: {
        entries,
        tree: buildFileTree(entries),
        folderSummary: summarizeByTopLevelFolder(entries),
        largest: pickLargestEntries(entries, 40)
      }
    };

    postMessage({ type: 'done', payload: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to parse APK.';
    postMessage({ type: 'error', message });
  }
};

export {};
