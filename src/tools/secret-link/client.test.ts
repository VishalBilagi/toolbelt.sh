import { afterEach, describe, expect, test } from 'bun:test';
import { initSecretLink } from './client';
import { decryptMessage } from './logic';
import { secretMessages } from './messages';

// A small event/field harness exercises the async controller without starting a browser.
// It does not simulate native form validation, layout, or Content Security Policy.
type Handler = (event: Event) => unknown;
class Field {
  value = '';
  hidden = false;
  disabled = false;
  required = false;
  type = 'password';
  textContent = '';
  validity = '';
  focused = false;
  selected = false;
  dataset: Record<string, string> = {};
  attributes: Record<string, string> = {};
  listeners = new Map<string, Handler[]>();
  addEventListener(type: string, handler: Handler): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), handler]);
  }
  async emit(type: string, event = new Event(type, { cancelable: true })): Promise<void> {
    await Promise.all((this.listeners.get(type) ?? []).map((handler) => handler(event)));
  }
  setAttribute(name: string, value: string): void { this.attributes[name] = value; }
  setCustomValidity(value: string): void { this.validity = value; }
  reportValidity(): boolean { return !this.validity; }
  focus(): void { this.focused = true; }
  select(): void { this.selected = true; }
}

const originals = new Map<string, PropertyDescriptor | undefined>();
const replaceGlobal = (name: string, value: unknown): void => {
  if (!originals.has(name)) originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, { value, configurable: true });
};
afterEach(() => {
  for (const [name, original] of originals) {
    if (original) Object.defineProperty(globalThis, name, original);
    else Reflect.deleteProperty(globalThis, name);
  }
  originals.clear();
});

const PHRASE = 'correct horse battery staple';
const FIXTURE = 'v1.AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGyx6GKl8kIiHVDYUwvCAF4h4SO7a6g6izrFRd9bnyiOd97P719SXKr1tHpMOr99Jz4wHPJow';
const TEXT = ' hello 🌍\n<script>literal</script> ';

const setup = (mode: 'create' | 'decrypt', fragment = '') => {
  const ids = ['form', 'controls', 'passphrase', 'reveal', 'submit', 'result', 'output', 'status', 'message', 'confirm', 'source', 'load-form', 'load-controls', 'count', 'confirm-wrap', 'phrase-hint', 'copy-output', 'clear', 'generate', 'copy-phrase', 'lock', 'result-title'];
  const fields = new Map(ids.map((id) => [id, new Field()]));
  const field = (id: string): Field => fields.get(id)!;
  const window = new Field();
  const location = { hash: fragment, pathname: '/es/tools/decrypt', search: '', origin: 'https://toolbelt.example' };
  const clipboard: string[] = [];
  replaceGlobal('document', { querySelector: () => ({ dataset: { mode, copy: JSON.stringify(secretMessages.en), decryptPath: '/es/tools/decrypt' }, querySelector: (selector: string) => fields.get(selector.replace('#secret-', '')) ?? null }) });
  replaceGlobal('window', window);
  replaceGlobal('location', location);
  replaceGlobal('history', { replaceState: () => { location.hash = ''; } });
  replaceGlobal('navigator', { clipboard: { writeText: async (text: string) => { clipboard.push(text); } } });
  initSecretLink();
  return { field, window, location, clipboard };
};

describe('Secret Link browser controller', () => {
  test('creates a localized fragment link and invalidates it when the message changes', async () => {
    const { field } = setup('create');
    const phrase = field('passphrase').value;
    expect(phrase.split(' ')).toHaveLength(6);
    expect(field('controls').disabled).toBe(false);
    field('message').value = TEXT;
    await field('form').emit('submit');
    const url = new URL(field('output').value);
    expect(url.pathname).toBe('/es/tools/decrypt');
    expect(url.search).toBe('');
    expect(url.href).not.toContain(phrase);
    expect(await decryptMessage(url.hash.slice(1), phrase)).toBe(TEXT);
    expect(field('result').hidden).toBe(false);
    field('message').value = 'changed';
    await field('message').emit('input');
    expect(field('result').hidden).toBe(true);
    expect(field('output').value).toBe('');
  });

  test('requires matching custom phrases and flags the UTF-8 byte limit', async () => {
    const { field } = setup('create');
    field('message').value = '🌍'.repeat(257);
    await field('message').emit('input');
    expect(field('message').validity).toBe(secretMessages.en.messageError);
    field('passphrase').value = PHRASE;
    await field('passphrase').emit('input');
    expect(field('confirm').required).toBe(true);
    expect(field('confirm-wrap').hidden).toBe(false);
    await field('form').emit('submit');
    expect(field('confirm').validity).toBe(secretMessages.en.mismatch);
    expect(field('result').hidden).toBe(true);
    await field('generate').emit('click');
    expect(field('confirm').required).toBe(false);
    expect(field('confirm').validity).toBe('');
  });

  test('allows retry after an incorrect phrase, copies text literally, and locks again', async () => {
    const { field, clipboard } = setup('decrypt', '#' + FIXTURE);
    expect(field('load-form').hidden).toBe(true);
    field('passphrase').value = 'wrong passphrase';
    await field('form').emit('submit');
    expect(field('status').textContent).toBe(secretMessages.en.unlockError);
    expect(field('controls').disabled).toBe(false);
    field('passphrase').value = PHRASE;
    await field('passphrase').emit('input');
    await field('form').emit('submit');
    expect(field('output').value).toBe(TEXT);
    expect(field('passphrase').value).toBe('');
    expect(field('form').hidden).toBe(true);
    await field('copy-output').emit('click');
    expect(clipboard).toEqual([TEXT]);
    await field('lock').emit('click');
    expect(field('output').value).toBe('');
    expect(field('result').hidden).toBe(true);
    expect(field('form').hidden).toBe(false);
  });

  test('clearing during decryption prevents a late result from restoring the secret', async () => {
    const { field, location } = setup('decrypt', '#' + FIXTURE);
    field('passphrase').value = PHRASE;
    const pending = field('form').emit('submit');
    expect(field('controls').disabled).toBe(true);
    await field('clear').emit('click');
    await pending;
    expect(field('output').value).toBe('');
    expect(field('passphrase').value).toBe('');
    expect(field('result').hidden).toBe(true);
    expect(field('load-form').hidden).toBe(false);
    expect(location.hash).toBe('');
  });

  test('changing the fragment while unlocking discards the previous operation', async () => {
    const { field, location, window } = setup('decrypt', '#' + FIXTURE);
    field('passphrase').value = PHRASE;
    const pending = field('form').emit('submit');
    location.hash = '#broken';
    await window.emit('hashchange');
    await pending;
    expect(field('output').value).toBe('');
    expect(field('status').textContent).toBe(secretMessages.en.payloadError);
    expect(field('form').hidden).toBe(true);
    expect(field('load-form').hidden).toBe(false);
  });

  test('pagehide clears sensitive fields even with encryption in progress', async () => {
    const { field, window } = setup('create');
    field('message').value = 'sensitive message';
    const pending = field('form').emit('submit');
    await window.emit('pagehide');
    await pending;
    for (const id of ['message', 'passphrase', 'confirm', 'output']) expect(field(id).value).toBe('');
    expect(field('result').hidden).toBe(true);
  });

  test('pasting a link only extracts the payload, without navigating to its host', async () => {
    const { field, location } = setup('decrypt');
    field('source').value = 'https://untrusted.example/#' + FIXTURE;
    await field('load-form').emit('submit');
    expect(location.origin).toBe('https://toolbelt.example');
    expect(field('form').hidden).toBe(false);
    expect(field('source').value).toBe('');
    field('passphrase').value = PHRASE;
    await field('form').emit('submit');
    expect(field('output').value).toBe(TEXT);
  });

  test('handles unavailable clipboard and insecure contexts without submitting secrets', async () => {
    const { field } = setup('create');
    replaceGlobal('navigator', {});
    await field('copy-phrase').emit('click');
    expect(field('status').textContent).toBe(secretMessages.en.copyFailed);
    expect(field('passphrase').selected).toBe(true);
    replaceGlobal('crypto', {});
    const insecure = setup('create');
    expect(insecure.field('controls').disabled).toBe(true);
    expect(insecure.field('status').textContent).toBe(secretMessages.en.unsupported);
    expect(insecure.field('passphrase').value).toBe('');
  });
});
