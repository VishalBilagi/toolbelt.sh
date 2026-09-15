export const MAX_MESSAGE_BYTES = 1024;
export const MAX_PASSPHRASE_BYTES = 1024;
const ITERATIONS = 600_000;
const PREFIX = 'v1.';
const HEADER_BYTES = 28; // 16-byte salt + 12-byte nonce
const TAG_BYTES = 16;
const MAX_PAYLOAD_LENGTH = PREFIX.length + Math.ceil((HEADER_BYTES + MAX_MESSAGE_BYTES + TAG_BYTES) * 4 / 3);
const encoder = new TextEncoder();
const AAD = encoder.encode('toolbelt.sh/secret-link/v1');

export type SecretErrorCode = 'unsupported' | 'message' | 'passphrase' | 'payload' | 'unlock';

export class SecretLinkError extends Error {
  constructor(public readonly code: SecretErrorCode) {
    super(code);
    this.name = 'SecretLinkError';
  }
}

export const byteLength = (value: string): number => encoder.encode(value).length;

const isWellFormed = (value: string): boolean => new TextDecoder('utf-8', { ignoreBOM: true }).decode(encoder.encode(value)) === value;

export const supportsEncryption = (): boolean =>
  typeof globalThis.crypto?.subtle !== 'undefined';

const requireCrypto = (): Crypto => {
  if (!supportsEncryption()) throw new SecretLinkError('unsupported');
  return globalThis.crypto;
};

const encodeBase64Url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');

/** Validate size and canonical encoding before any expensive key derivation. */
export const parsePayload = (payload: string): Uint8Array<ArrayBuffer> => {
  if (payload.length > MAX_PAYLOAD_LENGTH || !payload.startsWith(PREFIX)) {
    throw new SecretLinkError('payload');
  }
  const encoded = payload.slice(PREFIX.length);
  if (!/^[A-Za-z0-9_-]+$/.test(encoded) || encoded.length % 4 === 1) {
    throw new SecretLinkError('payload');
  }
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = Uint8Array.from(atob(encoded.replaceAll('-', '+').replaceAll('_', '/')), (char) => char.charCodeAt(0));
  } catch {
    throw new SecretLinkError('payload');
  }
  if (bytes.length <= HEADER_BYTES + TAG_BYTES || bytes.length > HEADER_BYTES + TAG_BYTES + MAX_MESSAGE_BYTES || encodeBase64Url(bytes) !== encoded) {
    throw new SecretLinkError('payload');
  }
  return bytes;
};

const deriveKey = async (passphrase: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> => {
  const crypto = requireCrypto();
  // Never trim, lowercase, or normalize: the recipient must enter the exact phrase.
  if (passphrase.length === 0 || passphrase.length > MAX_PASSPHRASE_BYTES || byteLength(passphrase) > MAX_PASSPHRASE_BYTES || !isWellFormed(passphrase)) {
    throw new SecretLinkError('passphrase');
  }
  const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
};

export const encryptMessage = async (message: string, passphrase: string): Promise<string> => {
  const crypto = requireCrypto();
  if (message.length === 0 || message.length > MAX_MESSAGE_BYTES || byteLength(message) > MAX_MESSAGE_BYTES || !isWellFormed(message)) {
    throw new SecretLinkError('message');
  }
  if (passphrase.length > MAX_PASSPHRASE_BYTES || [...passphrase].length < 12 || !passphrase.trim() || !isWellFormed(passphrase)) throw new SecretLinkError('passphrase');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: AAD, tagLength: 128 }, key, encoder.encode(message));
  const payload = new Uint8Array(HEADER_BYTES + encrypted.byteLength);
  payload.set(salt);
  payload.set(iv, 16);
  payload.set(new Uint8Array(encrypted), HEADER_BYTES);
  return PREFIX + encodeBase64Url(payload);
};

export const decryptMessage = async (payload: string, passphrase: string): Promise<string> => {
  const bytes = parsePayload(payload);
  const key = await deriveKey(passphrase, bytes.slice(0, 16));
  try {
    const plaintext = await requireCrypto().subtle.decrypt(
      { name: 'AES-GCM', iv: bytes.slice(16, HEADER_BYTES), additionalData: AAD, tagLength: 128 },
      key,
      bytes.slice(HEADER_BYTES),
    );
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(plaintext);
  } catch {
    // Do not distinguish an incorrect passphrase from a modified ciphertext.
    throw new SecretLinkError('unlock');
  }
};
