// Small shared helpers: DOM building, API calls with caching, storage, formatting, UI bits.

/* ---------- DOM ---------- */

/**
 * h('div', { class: 'x', onclick: fn }, 'text', child, [more])
 * Text is always inserted as text (never parsed as HTML), so API data can't inject markup.
 */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'html') el.innerHTML = v; // only ever used with static, trusted strings
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export const $ = (sel, root = document) => root.querySelector(sel);

/* ---------- Icons (static SVG strings) ---------- */

const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
  film: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>',
  video: '<rect x="2.5" y="5" width="19" height="14" rx="4"/><path d="m10 9 5 3-5 3z" fill="currentColor"/>',
  music: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  game: '<rect x="2" y="7" width="20" height="11" rx="5"/><path d="M7 10.5v4M5 12.5h4"/><circle cx="15.5" cy="11.5" r="1" fill="currentColor"/><circle cx="18" cy="14" r="1" fill="currentColor"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  play: '<path d="M7 4.5v15l13-7.5z" fill="currentColor" stroke="none"/>',
  pause: '<rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none"/>',
  next: '<path d="M5 5v14l10-7z" fill="currentColor" stroke="none"/><path d="M18 5v14"/>',
  prev: '<path d="M19 5v14L9 12z" fill="currentColor" stroke="none"/><path d="M6 5v14"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  volume: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
  mute: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="m17 9 5 6M22 9l-5 6"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>',
  starFill: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z" fill="currentColor"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  fullscreen: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  reload: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  radio: '<circle cx="12" cy="12" r="2"/><path d="M16.2 7.8a6 6 0 0 1 0 8.4M7.8 16.2a6 6 0 0 1 0-8.4M19 5a10 10 0 0 1 0 14M5 19A10 10 0 0 1 5 5"/>',
  chevronL: '<path d="m15 18-6-6 6-6"/>',
  chevronR: '<path d="m9 18 6-6-6-6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  tv: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="m8 2 4 4 4-4"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M15 8l2 2"/>',
};

export function icon(name, size = 20) {
  const span = document.createElement('span');
  span.className = 'icon';
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
  return span;
}

/* ---------- Storage (never throws) ---------- */

export const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem('lounge:' + key);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem('lounge:' + key, JSON.stringify(value));
    } catch {
      /* storage full or blocked */
    }
  },
};

/* ---------- API ---------- */

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data || {};
  }
}

const memCache = new Map();
const inflight = new Map();

/** GET /api/... with a small browser-side cache (saves YouTube quota and makes back/forward instant). */
export async function api(path, { ttl = 300 } = {}) {
  const url = '/api/' + path.replace(/^\/+/, '');
  const now = Date.now();
  const hit = memCache.get(url);
  if (hit && hit.exp > now) return hit.data;
  if (ttl > 0) {
    try {
      const raw = sessionStorage.getItem('api:' + url);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.exp > now) {
          memCache.set(url, saved);
          return saved.data;
        }
      }
    } catch {
      /* ignore */
    }
  }
  if (inflight.has(url)) return inflight.get(url);

  const p = (async () => {
    let res;
    try {
      res = await fetch(url, { headers: { accept: 'application/json' } });
    } catch {
      throw new ApiError('You seem to be offline.', 0);
    }
    let data = {};
    try {
      data = await res.json();
    } catch {
      /* non-JSON */
    }
    if (!res.ok) throw new ApiError(data.error || `Request failed (${res.status})`, res.status, data);
    if (ttl > 0) {
      const entry = { exp: Date.now() + ttl * 1000, data };
      memCache.set(url, entry);
      try {
        sessionStorage.setItem('api:' + url, JSON.stringify(entry));
      } catch {
        /* quota: ignore */
      }
    }
    return data;
  })();
  inflight.set(url, p);
  try {
    return await p;
  } finally {
    inflight.delete(url);
  }
}

export function post(path) {
  return fetch('/api/' + path.replace(/^\/+/, ''), { method: 'POST' }).catch(() => {});
}

/* ---------- Formatting ---------- */

export function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = String(sec % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

export function fmtCount(n) {
  if (n == null) return '';
  if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

export function timeAgo(iso) {
  if (!iso) return '';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  const units = [
    [31536000, 'year'],
    [2592000, 'month'],
    [604800, 'week'],
    [86400, 'day'],
    [3600, 'hour'],
    [60, 'minute'],
  ];
  for (const [secs, name] of units) {
    const v = Math.floor(s / secs);
    if (v >= 1) return `${v} ${name}${v > 1 ? 's' : ''} ago`;
  }
  return 'just now';
}

export function flag(cc) {
  if (!/^[A-Z]{2}$/.test(cc || '')) return '';
  return String.fromCodePoint(...[...cc].map((c) => 0x1f1a5 + c.charCodeAt(0)));
}

export function debounce(fn, ms = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/* ---------- Region (for where-to-watch + YouTube trending) ---------- */

export const REGIONS = {
  US: 'United States', GB: 'United Kingdom', CA: 'Canada', AU: 'Australia', NZ: 'New Zealand', IE: 'Ireland',
  NL: 'Netherlands', BE: 'Belgium', DE: 'Germany', AT: 'Austria', CH: 'Switzerland', FR: 'France',
  ES: 'Spain', PT: 'Portugal', IT: 'Italy', SE: 'Sweden', NO: 'Norway', DK: 'Denmark', FI: 'Finland',
  PL: 'Poland', CZ: 'Czechia', TR: 'Türkiye', IN: 'India', JP: 'Japan', KR: 'South Korea', PH: 'Philippines',
  SG: 'Singapore', ZA: 'South Africa', BR: 'Brazil', MX: 'Mexico', AR: 'Argentina', CO: 'Colombia',
};

export const region = {
  get() {
    const saved = store.get('region');
    if (saved && REGIONS[saved]) return saved;
    const fromConfig = window.__config?.region;
    if (fromConfig && REGIONS[fromConfig]) return fromConfig;
    const fromBrowser = (navigator.language || '').split('-')[1]?.toUpperCase();
    return REGIONS[fromBrowser] ? fromBrowser : 'US';
  },
  set(cc) {
    store.set('region', cc);
  },
};

export function regionSelect(onChange) {
  const current = region.get();
  const sel = h(
    'select',
    { class: 'select', 'aria-label': 'Your country' },
    Object.entries(REGIONS).map(([cc, name]) => h('option', { value: cc, selected: cc === current }, `${flag(cc)} ${name}`)),
  );
  sel.addEventListener('change', () => {
    region.set(sel.value);
    onChange?.(sel.value);
  });
  return sel;
}

/* ---------- History ("Jump back in") ---------- */

export function addHistory(item) {
  const list = store.get('history', []).filter((x) => !(x.kind === item.kind && x.id === item.id));
  list.unshift({ ...item, at: Date.now() });
  store.set('history', list.slice(0, 24));
}

export function getHistory() {
  return store.get('history', []);
}

/* ---------- UI pieces ---------- */

export function toast(message, kind = 'info') {
  const root = document.getElementById('toasts');
  if (!root) return;
  if ([...root.children].some((t) => t.textContent === message && !t.classList.contains('out'))) return;
  while (root.children.length >= 3) root.firstElementChild.remove();
  const el = h('div', { class: `toast toast-${kind}`, role: 'status' }, message);
  root.append(el);
  setTimeout(() => el.classList.add('out'), 3600);
  setTimeout(() => el.remove(), 4100);
}

export function setTitle(title) {
  document.title = title ? `${title} · ${siteName()}` : siteName();
}

export function siteName() {
  return window.__config?.siteName || 'Lounge';
}

/** Image that hides itself (shows a placeholder) if it fails to load. */
export function img(src, alt = '', cls = '') {
  if (!src) return h('div', { class: `img-fallback ${cls}` });
  const el = h('img', { src, alt, class: cls, loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' });
  el.addEventListener('error', () => el.replaceWith(h('div', { class: `img-fallback ${cls}` })), { once: true });
  return el;
}

export function skeleton(kind = 'poster', count = 8) {
  return Array.from({ length: count }, () => h('div', { class: `skel skel-${kind}` }));
}

export function emptyState(title, text, extra) {
  return h('div', { class: 'empty' }, h('div', { class: 'empty-title' }, title), text && h('p', null, text), extra);
}

const SETUP = {
  tmdb: {
    title: 'Add a free TMDB key to unlock Movies & TV search',
    steps: [
      'Create a free account at themoviedb.org and request an API key (Settings → API).',
      'In Cloudflare: your Pages project → Settings → Variables and Secrets → add a secret named TMDB_API_KEY.',
      'Redeploy. Search, trending and "where to watch" will light up.',
    ],
    note: 'Free public-domain classics already work without a key.',
  },
  youtube: {
    title: 'Add a free YouTube Data API key to unlock search',
    steps: [
      'In Google Cloud Console, create a project and enable "YouTube Data API v3".',
      'Create an API key (Credentials → Create credentials → API key).',
      'In Cloudflare: Pages project → Settings → Variables and Secrets → add a secret named YOUTUBE_API_KEY, then redeploy.',
    ],
    note: 'Until then you can paste any YouTube link above to play it.',
  },
};

export function setupCard(kind) {
  const s = SETUP[kind];
  if (!s) return null;
  return h(
    'div',
    { class: 'setup-card' },
    h('div', { class: 'setup-icon' }, icon('key', 22)),
    h(
      'div',
      null,
      h('h3', null, s.title),
      h('ol', null, s.steps.map((t) => h('li', null, t))),
      h('p', { class: 'muted' }, s.note, ' Full guide in README.md.'),
    ),
  );
}

/** Renders an error (or a setup card if a key is missing) with an optional retry button. */
export function errorView(err, retry) {
  if (err?.data?.setup) return setupCard(err.data.setup);
  return h(
    'div',
    { class: 'error-box' },
    h('span', null, err?.message || 'Something went wrong.'),
    retry && h('button', { class: 'btn btn-ghost btn-sm', onclick: retry }, icon('reload', 16), 'Try again'),
  );
}

/** A titled section with a horizontal scroller. Returns { el, body }. */
export function rowSection(title, { subtitle, link, linkText = 'See all', kind = 'poster' } = {}) {
  const body = h('div', { class: `scroller scroller-${kind}` }, skeleton(kind, 8));
  const left = h('button', { class: 'scroll-btn left', 'aria-label': 'Scroll left' }, icon('chevronL'));
  const right = h('button', { class: 'scroll-btn right', 'aria-label': 'Scroll right' }, icon('chevronR'));
  left.onclick = () => body.scrollBy({ left: -body.clientWidth * 0.85, behavior: 'smooth' });
  right.onclick = () => body.scrollBy({ left: body.clientWidth * 0.85, behavior: 'smooth' });
  const el = h(
    'section',
    { class: 'row' },
    h(
      'div',
      { class: 'row-head' },
      h('div', null, h('h2', null, title), subtitle && h('p', { class: 'row-sub' }, subtitle)),
      link && h('a', { class: 'row-link', href: link }, linkText, icon('chevronR', 16)),
    ),
    h('div', { class: 'scroller-wrap' }, left, body, right),
  );
  return { el, body };
}

/** Fill a container with the result of an async loader, handling loading + error states. */
export async function fill(container, loader, render, { onEmpty } = {}) {
  try {
    const data = await loader();
    container.replaceChildren(...[].concat(render(data) || []).filter(Boolean));
    if (!container.childElementCount && onEmpty) container.replaceChildren(onEmpty());
  } catch (err) {
    container.replaceChildren(errorView(err, () => fill(container, loader, render, { onEmpty })));
  }
}

export function searchBox({ placeholder, value = '', onSubmit, autofocus = false }) {
  const input = h('input', {
    class: 'search-input',
    type: 'search',
    placeholder,
    value,
    enterkeyhint: 'search',
    autocomplete: 'off',
    'aria-label': placeholder,
  });
  const form = h(
    'form',
    { class: 'search', role: 'search' },
    icon('search'),
    input,
    h('button', { class: 'btn btn-primary', type: 'submit' }, 'Search'),
  );
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    onSubmit(input.value.trim());
  });
  if (autofocus && matchMedia('(min-width: 760px)').matches) setTimeout(() => input.focus(), 50);
  return { form, input };
}

export function chips(options, active, onPick) {
  const wrap = h('div', { class: 'chips', role: 'tablist' });
  for (const [value, label] of options) {
    const b = h('button', { class: 'chip' + (value === active ? ' active' : ''), role: 'tab', 'aria-selected': String(value === active) }, label);
    b.onclick = () => {
      wrap.querySelectorAll('.chip').forEach((c) => {
        c.classList.remove('active');
        c.setAttribute('aria-selected', 'false');
      });
      b.classList.add('active');
      b.setAttribute('aria-selected', 'true');
      onPick(value);
    };
    wrap.append(b);
  }
  return wrap;
}

/** Navigate by hash. */
export function go(hash) {
  if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = hash;
}
