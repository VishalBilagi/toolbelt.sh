import { describe, expect, test } from 'bun:test';

import {
  buildFileTree,
  filterPermissions,
  formatBytes,
  isDangerousPermission,
  pickLargestEntries,
  summarizeByTopLevelFolder,
  type ApkFileEntry
} from './logic';

const ENTRIES: ApkFileEntry[] = [
  { path: 'AndroidManifest.xml', size: 2048 },
  { path: 'lib/arm64-v8a/libfoo.so', size: 40_000 },
  { path: 'lib/armeabi-v7a/libfoo.so', size: 20_000 },
  { path: 'assets/config.json', size: 512 },
  { path: 'res/layout/main.xml', size: 1024 }
];

describe('apk inspector logic', () => {
  test('formatBytes produces human-readable values', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1024)).toBe('1.00 KB');
    expect(formatBytes(8_388_608)).toBe('8.00 MB');
  });

  test('summarizeByTopLevelFolder groups files by root segment', () => {
    const summary = summarizeByTopLevelFolder(ENTRIES);
    expect(summary[0]?.key).toBe('lib');
    expect(summary.find((item) => item.key === '(root)')?.bytes).toBe(2048);
  });

  test('pickLargestEntries returns the highest-size entries', () => {
    const largest = pickLargestEntries(ENTRIES, 2);
    expect(largest).toHaveLength(2);
    expect(largest[0]?.path).toBe('lib/arm64-v8a/libfoo.so');
  });

  test('buildFileTree produces sorted hierarchical nodes', () => {
    const tree = buildFileTree(ENTRIES);
    expect(tree[0]?.name).toBe('lib');
    expect(tree[0]?.children[0]?.name).toBe('arm64-v8a');
  });

  test('dangerous permission helpers classify correctly', () => {
    expect(isDangerousPermission('android.permission.CAMERA')).toBeTrue();
    expect(isDangerousPermission('android.permission.INTERNET')).toBeFalse();

    const filtered = filterPermissions(
      ['android.permission.CAMERA', 'android.permission.INTERNET'],
      'android.permission',
      true
    );

    expect(filtered).toEqual(['android.permission.CAMERA']);
  });
});
