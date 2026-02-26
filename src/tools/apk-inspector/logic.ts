export interface ApkFileEntry {
  path: string;
  size: number;
}

export interface SizeBucket {
  key: string;
  bytes: number;
  fileCount: number;
}

export interface TreeNode {
  name: string;
  path: string;
  size: number;
  children: TreeNode[];
}

const DEFAULT_ROOT_BUCKET = '(root)';

export const FOLDER_FILTERS = ['lib/', 'assets/', 'res/', 'META-INF/'] as const;

export const DANGEROUS_PERMISSION_KEYWORDS = [
  'READ_CONTACTS',
  'WRITE_CONTACTS',
  'READ_SMS',
  'SEND_SMS',
  'RECEIVE_SMS',
  'READ_CALL_LOG',
  'WRITE_CALL_LOG',
  'RECORD_AUDIO',
  'CAMERA',
  'ACCESS_FINE_LOCATION',
  'ACCESS_COARSE_LOCATION',
  'READ_EXTERNAL_STORAGE',
  'WRITE_EXTERNAL_STORAGE',
  'READ_MEDIA',
  'BODY_SENSORS',
  'ANSWER_PHONE_CALLS',
  'READ_PHONE_STATE',
  'CALL_PHONE'
] as const;

export const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const precision = unitIndex === 0 ? 0 : value >= 100 ? 1 : 2;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
};

export const summarizeByTopLevelFolder = (entries: ApkFileEntry[]): SizeBucket[] => {
  const byFolder = new Map<string, SizeBucket>();

  for (const entry of entries) {
    const topLevel = entry.path.includes('/') ? entry.path.split('/')[0] : DEFAULT_ROOT_BUCKET;
    const bucket = byFolder.get(topLevel) ?? { key: topLevel, bytes: 0, fileCount: 0 };
    bucket.bytes += entry.size;
    bucket.fileCount += 1;
    byFolder.set(topLevel, bucket);
  }

  return [...byFolder.values()].sort((a, b) => b.bytes - a.bytes);
};

export const pickLargestEntries = (entries: ApkFileEntry[], count = 20): ApkFileEntry[] => {
  const safeCount = Math.max(1, Math.floor(count));
  return [...entries].sort((a, b) => b.size - a.size).slice(0, safeCount);
};

export const buildFileTree = (entries: ApkFileEntry[]): TreeNode[] => {
  const root: TreeNode[] = [];

  const insert = (nodes: TreeNode[], segments: string[], entrySize: number, parentPath = ''): void => {
    const segment = segments[0];
    if (!segment) return;

    const nodePath = parentPath ? `${parentPath}/${segment}` : segment;
    let node = nodes.find((item) => item.name === segment);

    if (!node) {
      node = { name: segment, path: nodePath, size: 0, children: [] };
      nodes.push(node);
    }

    node.size += entrySize;

    if (segments.length > 1) {
      insert(node.children, segments.slice(1), entrySize, nodePath);
    }
  };

  for (const entry of entries) {
    const segments = entry.path.split('/').filter(Boolean);
    insert(root, segments, entry.size);
  }

  const sortNodes = (nodes: TreeNode[]): TreeNode[] =>
    nodes
      .map((node) => ({ ...node, children: sortNodes(node.children) }))
      .sort((a, b) => b.size - a.size || a.name.localeCompare(b.name));

  return sortNodes(root);
};

export const normalizePermissionName = (permission: string): string => permission.trim();

export const isDangerousPermission = (permission: string): boolean => {
  const normalized = normalizePermissionName(permission).toUpperCase();
  return DANGEROUS_PERMISSION_KEYWORDS.some((keyword) => normalized.includes(keyword));
};

export const filterPermissions = (permissions: string[], query: string, dangerousOnly: boolean): string[] => {
  const normalizedQuery = query.trim().toLowerCase();

  return permissions.filter((permission) => {
    if (dangerousOnly && !isDangerousPermission(permission)) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    return permission.toLowerCase().includes(normalizedQuery);
  });
};
