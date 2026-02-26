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

const decodeUtf16Le = (bytes: Uint8Array): string => {
  const pairs = Math.floor(bytes.length / 2);
  const values = new Uint16Array(pairs);
  for (let index = 0; index < pairs; index += 1) {
    values[index] = bytes[index * 2] | (bytes[index * 2 + 1] << 8);
  }
  return String.fromCharCode(...values);
};

const extractAttribute = (manifestText: string, name: string): string => {
  const patterns = [new RegExp(`${name}\\s*=\\s*"([^"]+)"`), new RegExp(`${name}\\s*=\\s*'([^']+)'`)];

  for (const pattern of patterns) {
    const match = manifestText.match(pattern);
    if (match?.[1]) return match[1];
  }

  return 'Not found';
};

const extractPermissions = (manifestText: string): string[] => {
  const results = new Set<string>();
  const regex = /android\.permission\.[A-Z0-9_]+/g;

  for (const match of manifestText.matchAll(regex)) {
    if (match[0]) results.add(match[0]);
  }

  return [...results].sort((a, b) => a.localeCompare(b));
};

const summarizeComponents = (manifestText: string) => ({
  activities: (manifestText.match(/<activity\b|activity-alias\b/g) ?? []).length,
  services: (manifestText.match(/<service\b/g) ?? []).length,
  receivers: (manifestText.match(/<receiver\b/g) ?? []).length,
  providers: (manifestText.match(/<provider\b/g) ?? []).length
});

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

const decodeManifest = async (zip: JSZip): Promise<ManifestSummary> => {
  const manifestEntry = zip.file('AndroidManifest.xml');
  if (!manifestEntry) {
    return {
      packageName: 'Not found',
      versionName: 'Not found',
      versionCode: 'Not found',
      minSdk: 'Not found',
      targetSdk: 'Not found',
      appLabel: 'Not found',
      permissions: [],
      components: { activities: 0, services: 0, receivers: 0, providers: 0 },
      rawManifest: 'AndroidManifest.xml not found in archive.'
    };
  }

  const bytes = await manifestEntry.async('uint8array');
  const merged = `${new TextDecoder('utf-8', { fatal: false }).decode(bytes)}\n${decodeUtf16Le(bytes)}`;

  return {
    packageName: extractAttribute(merged, 'package'),
    versionName: extractAttribute(merged, 'versionName'),
    versionCode: extractAttribute(merged, 'versionCode'),
    minSdk: extractAttribute(merged, 'minSdkVersion'),
    targetSdk: extractAttribute(merged, 'targetSdkVersion'),
    appLabel: extractAttribute(merged, 'label'),
    permissions: extractPermissions(merged),
    components: summarizeComponents(merged),
    rawManifest: merged.slice(0, 180000)
  };
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
