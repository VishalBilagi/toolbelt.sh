import { byteLength, decryptMessage, encryptMessage, MAX_MESSAGE_BYTES, parsePayload, SecretLinkError, supportsEncryption } from './logic';
import { generatePassphrase } from './passphrase';
import type { SecretMessages } from './messages';

export const initSecretLink = (): void => {
  const root = document.querySelector<HTMLElement>('[data-secret-tool]');
  if (!root) return;
  const copy: SecretMessages = JSON.parse(root.dataset.copy ?? '{}');
  const creating = root.dataset.mode === 'create';
  const get = <T extends HTMLElement>(id: string): T => {
    const element = root.querySelector<T>(`#secret-${id}`);
    if (!element) throw new Error(`Missing Secret Link control: ${id}`);
    return element;
  };
  const form = get<HTMLFormElement>('form');
  const controls = get<HTMLFieldSetElement>('controls');
  const phrase = get<HTMLInputElement>('passphrase');
  const reveal = get<HTMLButtonElement>('reveal');
  const submit = get<HTMLButtonElement>('submit');
  const result = get<HTMLElement>('result');
  const output = get<HTMLTextAreaElement>('output');
  const status = get<HTMLElement>('status');
  const message = creating ? get<HTMLTextAreaElement>('message') : null;
  const confirmation = creating ? get<HTMLInputElement>('confirm') : null;
  const source = creating ? null : get<HTMLTextAreaElement>('source');
  const loadForm = creating ? null : get<HTMLFormElement>('load-form');
  let payload = '';
  let generatedPhrase = '';
  let revision = 0;
  let busy = false;

  const report = (text = '', error = false): void => {
    status.textContent = text;
    status.dataset.error = String(error);
  };
  const reportError = (error: unknown): void => {
    const messages = {
      unsupported: copy.unsupported,
      message: copy.messageError,
      passphrase: copy.passphraseError,
      payload: copy.payloadError,
      unlock: copy.unlockError,
    };
    report(error instanceof SecretLinkError ? messages[error.code] : copy.failed, true);
  };
  const setBusy = (value: boolean): void => {
    busy = value;
    controls.disabled = value || !supportsEncryption();
    form.setAttribute('aria-busy', String(value));
    submit.textContent = value ? (creating ? copy.creating : copy.unlocking) : (creating ? copy.create : copy.unlock);
  };
  const hidePhrase = (): void => {
    phrase.type = 'password';
    reveal.textContent = copy.show;
    reveal.setAttribute('aria-pressed', 'false');
  };
  const invalidate = (): void => {
    revision++;
    output.value = '';
    result.hidden = true;
    report();
  };
  const countMessage = (): void => {
    if (!message) return;
    const bytes = byteLength(message.value);
    const tooLong = bytes > MAX_MESSAGE_BYTES;
    get<HTMLOutputElement>('count').textContent = `${bytes} / 1,024 ${copy.bytes}`;
    message.setAttribute('aria-invalid', String(tooLong));
    message.setCustomValidity(tooLong ? copy.messageError : '');
  };
  const updateCustom = (): void => {
    if (!confirmation) return;
    const custom = phrase.value !== generatedPhrase;
    get('confirm-wrap').hidden = !custom;
    confirmation.required = custom;
    confirmation.setCustomValidity('');
    get('phrase-hint').textContent = custom ? copy.customHint : copy.phraseHint;
  };
  const regenerate = (): void => {
    generatedPhrase = generatePassphrase();
    phrase.value = generatedPhrase;
    if (confirmation) confirmation.value = '';
    hidePhrase();
    updateCustom();
  };
  const lock = (): void => {
    invalidate();
    phrase.value = '';
    hidePhrase();
    form.hidden = !payload;
    setBusy(false);
  };
  const clear = (): void => {
    invalidate();
    payload = '';
    generatedPhrase = '';
    phrase.value = '';
    if (message) message.value = '';
    if (confirmation) confirmation.value = '';
    if (source) source.value = '';
    hidePhrase();
    countMessage();
    updateCustom();
    setBusy(false);
    if (loadForm) {
      loadForm.hidden = false;
      form.hidden = true;
    }
  };
  const loadPayload = (value: string): void => {
    lock();
    payload = '';
    form.hidden = true;
    if (loadForm) loadForm.hidden = false;
    if (!value) return;
    try {
      parsePayload(value);
      payload = value;
      if (loadForm) loadForm.hidden = true;
      if (source) source.value = '';
      form.hidden = false;
    } catch (error) {
      reportError(error);
    }
  };
  const copyText = async (field: HTMLInputElement | HTMLTextAreaElement): Promise<void> => {
    const current = revision;
    try {
      await navigator.clipboard.writeText(field.value);
      if (current === revision) report(copy.copied);
    } catch {
      if (current !== revision) return;
      field.focus();
      field.select();
      report(copy.copyFailed, true);
    }
  };

  reveal.addEventListener('click', () => {
    const visible = phrase.type === 'password';
    phrase.type = visible ? 'text' : 'password';
    reveal.textContent = visible ? copy.hide : copy.show;
    reveal.setAttribute('aria-pressed', String(visible));
  });
  phrase.addEventListener('input', () => { invalidate(); updateCustom(); });
  confirmation?.addEventListener('input', () => { invalidate(); confirmation.setCustomValidity(''); });
  message?.addEventListener('input', () => { invalidate(); countMessage(); });
  get('copy-output').addEventListener('click', () => { void copyText(output); });
  get('clear').addEventListener('click', () => {
    clear();
    // Clearing the fragment never sends it to the server and prevents re-opening on refresh.
    if (!creating) history.replaceState(null, '', location.pathname + location.search);
    if (creating && supportsEncryption()) {
      try { regenerate(); } catch (error) { reportError(error); return; }
    }
    report(copy.cleared);
    (message ?? source)?.focus();
  });
  if (creating) {
    get('generate').addEventListener('click', () => {
      invalidate();
      try { regenerate(); } catch (error) { reportError(error); }
    });
    get('copy-phrase').addEventListener('click', () => { void copyText(phrase); });
  } else {
    get('lock').addEventListener('click', () => { lock(); phrase.focus(); });
    loadForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      const value = source?.value.trim() ?? '';
      const hashIndex = value.indexOf('#');
      // Extract only the fragment. Never navigate to, fetch, or trust a pasted host.
      loadPayload(hashIndex >= 0 ? value.slice(hashIndex + 1) : value);
      if (payload) phrase.focus();
    });
    window.addEventListener('hashchange', () => loadPayload(location.hash.slice(1)));
  }
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    invalidate();
    if (creating && confirmation && phrase.value !== generatedPhrase && phrase.value !== confirmation.value) {
      confirmation.setCustomValidity(copy.mismatch);
      confirmation.reportValidity();
      return;
    }
    const current = revision;
    setBusy(true);
    try {
      if (creating && message) {
        const encrypted = await encryptMessage(message.value, phrase.value);
        if (current !== revision) return;
        const url = new URL(root.dataset.decryptPath ?? '/tools/decrypt', location.origin);
        url.hash = encrypted;
        output.value = url.href;
      } else {
        const decrypted = await decryptMessage(payload, phrase.value);
        if (current !== revision) return;
        output.value = decrypted;
        phrase.value = '';
        hidePhrase();
        form.hidden = true;
      }
      result.hidden = false;
      get('result-title').focus();
    } catch (error) {
      if (current === revision) reportError(error);
    } finally {
      if (current === revision) setBusy(false);
    }
  });

  const initialize = (): void => {
    clear();
    if (!supportsEncryption()) { report(copy.unsupported, true); return; }
    try {
      if (creating) regenerate();
      else {
        get<HTMLFieldSetElement>('load-controls').disabled = false;
        loadPayload(location.hash.slice(1));
      }
    } catch (error) { reportError(error); }
  };
  // Clear fields before back/forward caching; never persist secrets in browser storage.
  window.addEventListener('pagehide', clear);
  window.addEventListener('pageshow', (event) => { if (event.persisted) initialize(); });
  initialize();
};
