# Secret Link v1

The create and decrypt routes are static pages. Messages and passphrases are processed
with Web Crypto on the user's device. No service stores the messages or keys.

## Wire format

`/tools/decrypt#v1.<base64url>` (also available under `/en` and `/es`).

The unpadded, canonical base64url string encodes this concatenation:

| Bytes | Contents |
| --- | --- |
| 0–15 | Fresh random 128-bit salt |
| 16–27 | Fresh random 96-bit AES-GCM nonce |
| 28 onwards | UTF-8 plaintext encrypted with AES-256-GCM, followed by its 128-bit authentication tag |

The AES key is derived from the **exact UTF-8 passphrase**, using PBKDF2-HMAC-SHA256
with 600,000 iterations and the salt above. No trimming, case folding, or Unicode
normalization is applied. Authenticated additional data is the UTF-8 string
`toolbelt.sh/secret-link/v1`. These parameters are fixed for v1; future changes
must introduce a new version and retain the ability to read existing v1 links.
No compression is used. Validate size and canonical encoding before key derivation.

Plaintext is limited to 1–1,024 UTF-8 bytes to keep links usable in messaging apps.
Passphrases are limited to 1,024 UTF-8 bytes; creation requires at least 12 Unicode
code points and rejects blank phrases. This minimum is not a strength guarantee.
Generated phrases select six words with replacement from 7,776 words, using
`crypto.getRandomValues` and rejection sampling to avoid modulo bias.

## Privacy boundary

- The fragment (after `#`) is not sent in HTTP requests. It can still appear in
  browser history, synced tabs, clipboard contents, and services where links are pasted.
- Share the passphrase separately. Someone holding the ciphertext can guess weak
  phrases offline. There is no rate limiting, expiry, revocation, or one-time read.
- `SecretLayout.astro` intentionally does not use `AppShell`: no analytics,
  LaunchDarkly, external fonts, or workbench storage. Production CSP blocks network
  connections and form submissions and permits scripts only from this origin.
  Development omits CSP so Astro's development scripts and HMR work.
- Inputs have no form names and start disabled until JavaScript initializes.
  Secrets are not written to browser storage. Fields clear on `pagehide`, and
  stale async results cannot repopulate a cleared or changed page. JavaScript
  cannot promise secure memory erasure; copying intentionally writes the clipboard.
- Requires HTTPS (or localhost), trustworthy delivered JavaScript, and a trusted
  browser/device. CSP does not protect against compromised same-origin code,
  malicious extensions, or compromised hosting. This feature has not been audited.
- Treat decrypted text as text, never HTML. Wrong passwords and authentication
  failures use the same error. Never log plaintext, passphrases, or complete links.

## References and wordlist attribution

- [Web Crypto AES-GCM parameters](https://developer.mozilla.org/en-US/docs/Web/API/AesGcmParams)
- [OWASP PBKDF2 work-factor guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [EFF Long Wordlist](https://www.eff.org/files/2016/07/18/eff_large_wordlist.txt),
  © Electronic Frontier Foundation, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/),
  under [EFF's copyright policy](https://www.eff.org/copyright).
  `words.ts` removes the dice codes and retains all 7,776 words in their original
  order. See [EFF's passphrase guidance](https://www.eff.org/dice).

Validation: `bun test src/tools/secret-link` and `bun run build`. Inspect the built
private pages as well as their imported JS to ensure no telemetry is introduced.
