import { PASSPHRASE_WORDS } from './words';

/** Rejection sampling avoids modulo bias for a list whose length is not a power of two. */
export const generatePassphrase = (): string => {
  const count = PASSPHRASE_WORDS.length;
  const limit = Math.floor(0x1_0000_0000 / count) * count;
  const words: string[] = [];
  const sample = new Uint32Array(1);
  while (words.length < 6) {
    crypto.getRandomValues(sample);
    if (sample[0] < limit) words.push(PASSPHRASE_WORDS[sample[0] % count]);
  }
  return words.join(' ');
};
