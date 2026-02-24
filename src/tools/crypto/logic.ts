export type CryptoAlgorithm = 'SHA-256' | 'SHA-1' | 'MD5';

const MD5_K = Array.from({ length: 64 }, (_, index) =>
  Math.floor(Math.abs(Math.sin(index + 1)) * 0x100000000) >>> 0
);

const MD5_SHIFT = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5,
  9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11,
  16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15,
  21
] as const;

const MD5_INDEX = (round: number): number => {
  if (round < 16) return round;
  if (round < 32) return (5 * round + 1) % 16;
  if (round < 48) return (3 * round + 5) % 16;
  return (7 * round) % 16;
};

const rotateLeft = (value: number, shift: number): number =>
  ((value << shift) | (value >>> (32 - shift))) >>> 0;

const toUtf8Bytes = (value: string): Uint8Array => new TextEncoder().encode(value);

const concatBytes = (...arrays: Uint8Array[]): Uint8Array => {
  const length = arrays.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;

  for (const chunk of arrays) {
    output.set(chunk, offset);
    offset += chunk.length;
  }

  return output;
};

const padMd5Input = (input: Uint8Array): Uint8Array => {
  const bitLength = input.length * 8;
  const withOneBit = input.length + 1;
  const paddedLength = (withOneBit + 8 + 63) & ~63;
  const output = new Uint8Array(paddedLength);
  output.set(input);
  output[input.length] = 0x80;

  const view = new DataView(output.buffer);
  view.setUint32(paddedLength - 8, bitLength >>> 0, true);
  view.setUint32(paddedLength - 4, Math.floor(bitLength / 0x100000000), true);

  return output;
};

const md5DigestBytes = (input: Uint8Array): Uint8Array => {
  const buffer = padMd5Input(input);
  const words = new Uint32Array(16);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  for (let offset = 0; offset < buffer.length; offset += 64) {
    const chunkView = new DataView(buffer.buffer, offset, 64);
    for (let index = 0; index < 16; index += 1) {
      words[index] = chunkView.getUint32(index * 4, true);
    }

    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;

    for (let round = 0; round < 64; round += 1) {
      let f = 0;
      if (round < 16) f = (b & c) | (~b & d);
      else if (round < 32) f = (d & b) | (~d & c);
      else if (round < 48) f = b ^ c ^ d;
      else f = c ^ (b | ~d);

      const g = MD5_INDEX(round);
      const sum = (a + f + MD5_K[round] + words[g]) >>> 0;
      const rotated = rotateLeft(sum, MD5_SHIFT[round]);

      a = d;
      d = c;
      c = b;
      b = (b + rotated) >>> 0;
    }

    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }

  const digest = new Uint8Array(16);
  const digestView = new DataView(digest.buffer);
  digestView.setUint32(0, a0, true);
  digestView.setUint32(4, b0, true);
  digestView.setUint32(8, c0, true);
  digestView.setUint32(12, d0, true);
  return digest;
};

export const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (const value of bytes) binary += String.fromCharCode(value);
  return btoa(binary);
};

const cryptoDigest = async (algorithm: Exclude<CryptoAlgorithm, 'MD5'>, value: string): Promise<Uint8Array> => {
  const digest = await crypto.subtle.digest(algorithm, toUtf8Bytes(value));
  return new Uint8Array(digest);
};

export async function hashText(algorithm: CryptoAlgorithm, value: string): Promise<string> {
  if (algorithm === 'MD5') {
    return bytesToHex(md5DigestBytes(toUtf8Bytes(value)));
  }

  return bytesToHex(await cryptoDigest(algorithm, value));
}

const hmacWithWebCrypto = async (
  algorithm: Exclude<CryptoAlgorithm, 'MD5'>,
  value: string,
  key: string
): Promise<Uint8Array> => {
  const importedKey = await crypto.subtle.importKey(
    'raw',
    toUtf8Bytes(key),
    { name: 'HMAC', hash: { name: algorithm } },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', importedKey, toUtf8Bytes(value));
  return new Uint8Array(signature);
};

const hmacMd5 = (value: string, key: string): Uint8Array => {
  const blockSize = 64;
  let keyBytes = toUtf8Bytes(key);

  if (keyBytes.length > blockSize) {
    keyBytes = md5DigestBytes(keyBytes);
  }

  if (keyBytes.length < blockSize) {
    const padded = new Uint8Array(blockSize);
    padded.set(keyBytes);
    keyBytes = padded;
  }

  const outerPad = new Uint8Array(blockSize);
  const innerPad = new Uint8Array(blockSize);

  for (let index = 0; index < blockSize; index += 1) {
    outerPad[index] = keyBytes[index] ^ 0x5c;
    innerPad[index] = keyBytes[index] ^ 0x36;
  }

  const innerDigest = md5DigestBytes(concatBytes(innerPad, toUtf8Bytes(value)));
  return md5DigestBytes(concatBytes(outerPad, innerDigest));
};

export async function signHmac(algorithm: CryptoAlgorithm, value: string, key: string): Promise<string> {
  if (!key) {
    throw new Error('HMAC key is required.');
  }

  if (algorithm === 'MD5') {
    return bytesToHex(hmacMd5(value, key));
  }

  return bytesToHex(await hmacWithWebCrypto(algorithm, value, key));
}

export function generateUuidV4(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytesToHex(bytes);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const formatDigest = (
  digestHex: string,
  outputFormat: 'hex' | 'base64' = 'hex'
): string => {
  if (outputFormat === 'hex') return digestHex;

  const bytes = new Uint8Array(digestHex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    const segment = digestHex.slice(index * 2, index * 2 + 2);
    bytes[index] = Number.parseInt(segment, 16);
  }

  return bytesToBase64(bytes);
};
