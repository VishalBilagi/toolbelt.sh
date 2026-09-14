import { toolSections } from '../data/tool-directory';
import { addRecentTool, matchesToolSearch, parseToolList } from './tool-discovery';

const validPaths = toolSections.flatMap(section => section.tools.map(tool => tool.href));
const FAVORITES_KEY = 'toolbelt-favorites';
const RECENT_KEY = 'toolbelt-recent';
const memory = new Map<string, string>();

const readPreference = (key: string): string | null => {
  try { return localStorage.getItem(key) ?? memory.get(key) ?? null; }
  catch { return memory.get(key) ?? null; }
};
const writePreference = (key: string, value: string): void => {
  memory.set(key, value);
  try { localStorage.setItem(key, value); }
  catch { console.info('Toolbelt: preferences are available for this page only because browser storage is unavailable.'); }
};

export const initShell = (): void => {
  const sidebar = document.querySelector<HTMLElement>('.sidebar');
  const toggle = document.querySelector<HTMLButtonElement>('[data-sidebar-toggle]');
  const backdrop = document.querySelector<HTMLButtonElement>('[data-sidebar-close]');
  const main = document.querySelector<HTMLElement>('.app-main');
  const mobile = window.matchMedia('(max-width: 900px)');
  const setSidebar = (open: boolean, restoreFocus = true): void => {
    document.body.classList.toggle('sidebar-open', open);
    toggle?.setAttribute('aria-expanded', String(open));
    if (backdrop) backdrop.hidden = !open;
    if (main) main.inert = open;
    if (open) sidebar?.querySelector<HTMLElement>('a, button')?.focus();
    else if (restoreFocus) toggle?.focus();
  };
  toggle?.addEventListener('click', () => setSidebar(!document.body.classList.contains('sidebar-open')));
  backdrop?.addEventListener('click', () => setSidebar(false));
  mobile.addEventListener('change', () => { if (!mobile.matches) setSidebar(false, false); });
  document.querySelector('[data-mode-toggle]')?.addEventListener('click', () => {
    const next = document.documentElement.dataset.mode === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.mode = next;
    writePreference('mode', next);
  });

  const dialog = document.querySelector<HTMLDialogElement>('#tool-search-dialog');
  const search = document.querySelector<HTMLInputElement>('#global-tool-search');
  const results = Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-search-result]'));
  const empty = document.querySelector<HTMLElement>('[data-search-empty]');
  let searchTrigger: HTMLElement | null = null;
  const filterSearch = (): void => {
    for (const result of results) result.hidden = !matchesToolSearch(result.dataset.search ?? '', search?.value ?? '');
    if (empty) empty.hidden = results.some(result => !result.hidden);
  };
  const openSearch = (trigger: HTMLElement | null): void => {
    const fromMobileSidebar = document.body.classList.contains('sidebar-open');
    if (fromMobileSidebar) setSidebar(false, false);
    searchTrigger = fromMobileSidebar ? toggle : trigger;
    if (search) search.value = '';
    filterSearch();
    dialog?.showModal();
    search?.focus();
  };
  document.querySelectorAll<HTMLElement>('[data-search-open]').forEach(button => {
    button.addEventListener('click', () => openSearch(button));
  });
  document.querySelector('[data-search-close]')?.addEventListener('click', () => dialog?.close());
  dialog?.addEventListener('close', () => searchTrigger?.focus());
  dialog?.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  search?.addEventListener('input', filterSearch);
  dialog?.addEventListener('keydown', event => {
    const visible = results.filter(result => !result.hidden);
    if (!visible.length) return;
    const index = visible.findIndex(result => result === document.activeElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const next = event.key === 'ArrowDown' ? (index + 1) % visible.length : (index <= 0 ? visible.length - 1 : index - 1);
      visible[next]?.focus();
    } else if (event.key === 'Enter' && document.activeElement === search) {
      event.preventDefault();
      visible[0]?.click();
    }
  });
  document.addEventListener('keydown', event => {
    const editing = event.target instanceof Element && !!event.target.closest('input, textarea, select, [contenteditable="true"]');
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      if (dialog?.open) dialog.close();
      else openSearch(document.activeElement instanceof HTMLElement ? document.activeElement : null);
    } else if (event.key === '/' && !editing && !dialog?.open && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      const directorySearch = document.querySelector<HTMLInputElement>('#tool-search');
      if (directorySearch && !document.body.classList.contains('sidebar-open')) directorySearch.focus();
      else openSearch(document.activeElement instanceof HTMLElement ? document.activeElement : null);
    }
    if (!document.body.classList.contains('sidebar-open')) return;
    if (event.key === 'Escape') setSidebar(false);
    if (event.key === 'Tab' && sidebar) {
      const focusable = Array.from(sidebar.querySelectorAll<HTMLElement>('a[href], button, select'));
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  });

  const path = window.location.pathname.replace(/^\/(en|es)(?=\/|$)/, '').replace(/\/$/, '');
  const previous = parseToolList(readPreference(RECENT_KEY), validPaths);
  if (validPaths.includes(path)) writePreference(RECENT_KEY, JSON.stringify(addRecentTool(previous, path)));
  const recentSection = document.querySelector<HTMLElement>('[data-recent-section]');
  if (recentSection && previous.length) {
    recentSection.hidden = false;
    recentSection.querySelectorAll<HTMLElement>('[data-recent-tool]').forEach(link => {
      const index = previous.indexOf(link.dataset.recentTool ?? '');
      link.hidden = index === -1;
      link.style.order = String(index);
    });
  }
};

export const initDirectory = (): void => {
  const root = document.querySelector<HTMLElement>('[data-directory]');
  if (!root) return;
  const input = root.querySelector<HTMLInputElement>('#tool-search');
  const cards = Array.from(root.querySelectorAll<HTMLElement>('[data-tool-card]'));
  const filters = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-category]'));
  const favoriteButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-favorite]'));
  let favorites = new Set(parseToolList(readPreference(FAVORITES_KEY), validPaths));
  const params = new URLSearchParams(window.location.search);
  let category = params.get('category') ?? 'all';
  if (!filters.some(button => button.dataset.category === category)) category = 'all';
  if (input) input.value = params.get('q') ?? '';

  const render = (): void => {
    let count = 0;
    for (const card of cards) {
      const matchesCategory = category === 'all' || (category === 'saved' ? favorites.has(card.dataset.tool ?? '') : card.dataset.section === category);
      card.hidden = !matchesCategory || !matchesToolSearch(card.dataset.search ?? '', input?.value ?? '');
      if (!card.hidden) count++;
    }
    for (const filter of filters) {
      const active = filter.dataset.category === category;
      filter.classList.toggle('is-active', active);
      filter.setAttribute('aria-pressed', String(active));
    }
    favoriteButtons.forEach(button => button.setAttribute('aria-pressed', String(favorites.has(button.dataset.favorite ?? ''))));
    const counter = root.querySelector<HTMLElement>('[data-results-count]');
    if (counter) counter.textContent = (root.dataset.resultTemplate ?? '{count} tools').replace('{count}', String(count));
    const empty = root.querySelector<HTMLElement>('[data-directory-empty]');
    if (empty) empty.hidden = count > 0;
    root.querySelectorAll<HTMLElement>('[data-empty-title], [data-empty-body]').forEach(node => {
      node.textContent = (category === 'saved' && !favorites.size ? node.dataset.saved : node.dataset.default) ?? '';
    });
  };
  const update = (): void => {
    const url = new URL(window.location.href);
    const query = input?.value.trim() ?? '';
    if (query) url.searchParams.set('q', query); else url.searchParams.delete('q');
    if (category !== 'all') url.searchParams.set('category', category); else url.searchParams.delete('category');
    window.history.replaceState(null, '', url);
    render();
  };
  input?.addEventListener('input', update);
  filters.forEach(button => button.addEventListener('click', () => { category = button.dataset.category ?? 'all'; update(); }));
  favoriteButtons.forEach(button => button.addEventListener('click', () => {
    const path = button.dataset.favorite ?? '';
    if (favorites.has(path)) favorites.delete(path); else favorites.add(path);
    writePreference(FAVORITES_KEY, JSON.stringify([...favorites]));
    update();
    if (category === 'saved' && !favorites.has(path)) filters.find(filter => filter.dataset.category === 'saved')?.focus();
  }));
  root.querySelector('[data-reset-filters]')?.addEventListener('click', () => {
    category = 'all';
    if (input) { input.value = ''; input.focus(); }
    update();
  });
  window.addEventListener('storage', event => {
    if (event.key !== FAVORITES_KEY) return;
    favorites = new Set(parseToolList(event.newValue, validPaths));
    render();
  });
  render();
};
