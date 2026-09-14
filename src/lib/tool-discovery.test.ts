import { describe, expect, test } from 'bun:test';
import { addRecentTool, matchesToolSearch, parseToolList } from './tool-discovery';

describe('tool discovery', () => {
  test('finds tasks across names and aliases, ignoring case and accents', () => {
    expect(matchesToolSearch('Encoding & Tokens Base64 JWT decode', 'JWT decode')).toBe(true);
    expect(matchesToolSearch('Paleta de imágenes', 'IMAGENES')).toBe(true);
    expect(matchesToolSearch('JSON format validate', 'json csv')).toBe(false);
    expect(matchesToolSearch('Any tool', '   ')).toBe(true);
  });
  test('rejects malformed preferences and unknown paths', () => {
    const paths = ['/tools/qr', '/tools/epoch'];
    expect(parseToolList('{', paths)).toEqual([]);
    expect(parseToolList('{}', paths)).toEqual([]);
    expect(parseToolList('["/tools/qr", 1, null, "/unknown", "/tools/qr"]', paths)).toEqual(['/tools/qr']);
  });
  test('recent tools move to the front without duplicates and stay bounded', () => {
    expect(addRecentTool(['a', 'b', 'c'], 'b')).toEqual(['b', 'a', 'c']);
    expect(addRecentTool(['a', 'b', 'c'], 'd')).toEqual(['d', 'a', 'b']);
    expect(addRecentTool(['a'], 'b', 0)).toEqual([]);
  });
});
