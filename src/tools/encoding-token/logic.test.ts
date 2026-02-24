import { describe, expect, test } from 'bun:test';

import {
  base64Decode,
  base64Encode,
  buildQueryOutput,
  decodeJwt,
  formatUnixTimestamp,
  parseQueryInput,
  urlDecode,
  urlEncode
} from './logic';

describe('base64 encoding', () => {
  test('round-trips unicode text', () => {
    const value = 'hello ✅ दुनिया';
    const encoded = base64Encode(value);
    expect(base64Decode(encoded)).toBe(value);
  });

  test('throws on invalid data', () => {
    expect(() => base64Decode('%%%')).toThrow('Invalid Base64 input.');
  });
});

describe('url encoding', () => {
  test('encodes and decodes special characters', () => {
    const value = 'a+b = 100%';
    expect(urlDecode(urlEncode(value))).toBe(value);
  });
});

describe('query parsing and rebuilding', () => {
  test('supports full urls with duplicate params', () => {
    const input = 'https://toolbelt.sh/path?tag=one&tag=two&empty=&q=hello%20world#frag';
    const parsed = parseQueryInput(input);
    const rebuilt = buildQueryOutput(parsed.basePath, parsed.entries, parsed.hash);
    const reparsed = parseQueryInput(rebuilt);

    expect(parsed.basePath).toBe('https://toolbelt.sh/path');
    expect(parsed.entries).toEqual(reparsed.entries);
    expect(parsed.hash).toBe(reparsed.hash);
  });

  test('supports raw query text', () => {
    const parsed = parseQueryInput('foo=1&bar=two');
    expect(parsed.basePath).toBe('');
    expect(parsed.entries).toEqual([
      { key: 'foo', value: '1' },
      { key: 'bar', value: 'two' }
    ]);
    expect(buildQueryOutput('', parsed.entries)).toBe('?foo=1&bar=two');
  });
});

describe('jwt decode', () => {
  test('decodes payload and timestamp claims without verification', () => {
    const token =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
      'eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.' +
      'SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

    const decoded = decodeJwt(token);
    expect(decoded.header.alg).toBe('HS256');
    expect(decoded.payload.name).toBe('John Doe');
    expect(decoded.timestamps[0]?.claim).toBe('iat');
    expect(decoded.timestamps[0]?.iso).toBe('2018-01-18T01:30:22.000Z');
  });
});

describe('timestamp formatting', () => {
  test('returns deterministic iso and utc strings', () => {
    const formatted = formatUnixTimestamp(1516239022);
    expect(formatted.iso).toBe('2018-01-18T01:30:22.000Z');
    expect(formatted.utc).toBe('Thu, 18 Jan 2018 01:30:22 GMT');
  });
});
