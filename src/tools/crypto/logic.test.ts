import { describe, expect, test } from 'bun:test';

import { formatDigest, generateUuidV4, hashText, signHmac } from './logic';

describe('hashText', () => {
  test('matches known SHA-256 vector', async () => {
    const digest = await hashText('SHA-256', 'abc');
    expect(digest).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  test('matches known SHA-1 vector', async () => {
    const digest = await hashText('SHA-1', 'abc');
    expect(digest).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
  });

  test('matches known MD5 vector', async () => {
    const digest = await hashText('MD5', 'abc');
    expect(digest).toBe('900150983cd24fb0d6963f7d28e17f72');
  });
});

describe('signHmac', () => {
  test('matches known HMAC-SHA256 vector', async () => {
    const digest = await signHmac('SHA-256', 'The quick brown fox jumps over the lazy dog', 'key');
    expect(digest).toBe('f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8');
  });

  test('matches known HMAC-SHA1 vector', async () => {
    const digest = await signHmac('SHA-1', 'The quick brown fox jumps over the lazy dog', 'key');
    expect(digest).toBe('de7c9b85b8b78aa6bc8a7a36f70a90701c9db4d9');
  });

  test('supports HMAC-MD5 fallback', async () => {
    const digest = await signHmac('MD5', 'The quick brown fox jumps over the lazy dog', 'key');
    expect(digest).toBe('80070713463e7749b90c2dc24911e275');
  });
});

describe('formatDigest', () => {
  test('converts hex digest to base64', () => {
    const formatted = formatDigest('900150983cd24fb0d6963f7d28e17f72', 'base64');
    expect(formatted).toBe('kAFQmDzST7DWlj99KOF/cg==');
  });
});

describe('generateUuidV4', () => {
  test('returns RFC 4122 v4 format', () => {
    const uuid = generateUuidV4();
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
