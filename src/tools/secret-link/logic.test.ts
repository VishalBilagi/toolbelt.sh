import { describe, expect, spyOn, test } from 'bun:test';
import { byteLength, decryptMessage, encryptMessage, MAX_MESSAGE_BYTES, parsePayload, SecretLinkError } from './logic';
import { generatePassphrase } from './passphrase';
import { PASSPHRASE_WORDS } from './words';

const PHRASE = 'correct horse battery staple';
const TEXT = ' hello 🌍\n<script>literal</script> ';
// Independently produced with node:crypto pbkdf2Sync/createCipheriv, salt 00..0f,
// nonce 10..1b, 600,000 iterations, and AAD toolbelt.sh/secret-link/v1.
const FIXTURE = 'v1.AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGyx6GKl8kIiHVDYUwvCAF4h4SO7a6g6izrFRd9bnyiOd97P719SXKr1tHpMOr99Jz4wHPJow';
const encode = (bytes: Uint8Array): string => 'v1.' + Buffer.from(bytes).toString('base64url');

describe('Secret Link encryption', () => {
  test('decrypts an independent fixture without changing whitespace, Unicode, or markup', async () => {
    expect(await decryptMessage(FIXTURE, PHRASE)).toBe(TEXT);
  });

  test('encrypts to the interoperable format with fresh salt and nonce calls', async () => {
    let nextByte = 0;
    const sizes: number[] = [];
    const random = spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
      const bytes = array as Uint8Array;
      sizes.push(bytes.length);
      for (let i = 0; i < bytes.length; i++) bytes[i] = nextByte++;
      return array;
    });
    try {
      expect(await encryptMessage(TEXT, PHRASE)).toBe(FIXTURE);
      const second = await encryptMessage(TEXT, PHRASE);
      expect(second).not.toBe(FIXTURE);
      expect(sizes).toEqual([16, 12, 16, 12]);
      expect(await decryptMessage(second, PHRASE)).toBe(TEXT);
    } finally { random.mockRestore(); }
  });

  test('round trips the maximum UTF-8 message size', async () => {
    const message = '🌍'.repeat(256);
    expect(byteLength(message)).toBe(MAX_MESSAGE_BYTES);
    expect(await decryptMessage(await encryptMessage(message, PHRASE), PHRASE)).toBe(message);
  });

  test('rejects empty, oversized, or malformed Unicode messages', async () => {
    for (const message of ['', 'a'.repeat(1025), '🌍'.repeat(257), '\ud800']) {
      await expect(encryptMessage(message, PHRASE)).rejects.toMatchObject({ code: 'message' });
    }
  });

  test('rejects invalid new passphrases and oversized decryption passphrases', async () => {
    for (const phrase of ['', 'short', ' '.repeat(12), 'x'.repeat(1025), '🌍'.repeat(257), 'x'.repeat(12) + '\ud800']) {
      await expect(encryptMessage('message', phrase)).rejects.toMatchObject({ code: 'passphrase' });
    }
    await expect(decryptMessage(FIXTURE, '🌍'.repeat(257))).rejects.toMatchObject({ code: 'passphrase' });
  });

  test('does not trim or case-fold the passphrase', async () => {
    for (const phrase of [PHRASE + ' ', PHRASE.toUpperCase(), 'incorrect passphrase']) {
      await expect(decryptMessage(FIXTURE, phrase)).rejects.toMatchObject({ code: 'unlock' });
    }
    const spaced = '  twelve characters  ';
    expect(await decryptMessage(await encryptMessage('exact spaces', spaced), spaced)).toBe('exact spaces');
  });

  test('does not normalize Unicode passphrases', async () => {
    const composed = 'café café café';
    const encrypted = await encryptMessage('unicode', composed);
    await expect(decryptMessage(encrypted, composed.normalize('NFD'))).rejects.toMatchObject({ code: 'unlock' });
  });

  test('preserves a leading Unicode byte-order mark in messages and passphrases', async () => {
    const message = '\ufeffa note with a leading BOM';
    const phrase = '\ufeff' + PHRASE;
    expect(await decryptMessage(await encryptMessage(message, phrase), phrase)).toBe(message);
  });

  test('authenticates salt, nonce, ciphertext, and tag with the same failure', async () => {
    for (const index of [0, 16, 28, parsePayload(FIXTURE).length - 1]) {
      const modified = parsePayload(FIXTURE);
      modified[index] ^= 1;
      await expect(decryptMessage(encode(modified), PHRASE)).rejects.toMatchObject({ code: 'unlock' });
    }
  });

  test('rejects unknown versions, truncated data, noncanonical encodings, and oversize links before KDF', async () => {
    const derive = spyOn(crypto.subtle, 'deriveKey');
    const invalid = ['', '#'+FIXTURE, FIXTURE.replace('v1.', 'v2.'), FIXTURE + '=', FIXTURE + '%20', 'v1.a', 'v1.!!!!', 'v1.AAAA', encode(new Uint8Array(44)), encode(new Uint8Array(1069)), 'v1.' + 'a'.repeat(1_000_000)];
    // Change the unused low-order bits in the final base64 character.
    invalid.push(encode(new Uint8Array(46)).slice(0, -1) + 'B');
    try {
      for (const payload of invalid) {
        expect(() => parsePayload(payload)).toThrow(SecretLinkError);
        await expect(decryptMessage(payload, PHRASE)).rejects.toMatchObject({ code: 'payload' });
      }
      expect(derive).not.toHaveBeenCalled();
    } finally { derive.mockRestore(); }
  });
});

describe('generated passphrases', () => {
  test('bundles the complete unique EFF list with single-token words', () => {
    expect(PASSPHRASE_WORDS).toHaveLength(7776);
    expect(new Set(PASSPHRASE_WORDS).size).toBe(7776);
    expect(PASSPHRASE_WORDS.every((word) => /^[a-z]+(?:-[a-z]+)*$/.test(word))).toBe(true);
  });

  test('uses cryptographic samples and rejects biased values at the boundary', () => {
    const limit = Math.floor(0x1_0000_0000 / 7776) * 7776;
    const samples = [limit, 0xffffffff, 0, 7775, 7776, 1, 2, limit - 1];
    const random = spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
      (array as Uint32Array)[0] = samples.shift()!;
      return array;
    });
    try {
      expect(generatePassphrase()).toBe([0, 7775, 0, 1, 2, 7775].map((index) => PASSPHRASE_WORDS[index]).join(' '));
      expect(random).toHaveBeenCalledTimes(8);
    } finally { random.mockRestore(); }
  });
});
