// App entry: loads config, mounts the player, and routes #/hash URLs to pages.
import { $, api, h, icon, setTitle, siteName } from './lib.js';
import { closeTheater, mountPlayer } from './player.js';
import * as home from './pages/home.js';
import * as movies from './pages/movies.js';
import * as youtube from './pages/youtube.js';
import * as music from './pages/music.js';
import * as games from './pages/games.js';

const PAGES = { '': home, movies, youtube, music, games };

let cleanup = null;

function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [pathPart, queryPart = ''] = raw.split('?');
  const parts = pathPart.split('/').filter(Boolean).map(decodeURIComponent);
  return { page: parts[0] || '', parts: parts.slice(1), query: new URLSearchParams(queryPart) };
}

async function route() {
  const r = parseRoute();
  const page = PAGES[r.page] ? r.page : '';
  const mod = PAGES[page];

  closeTheater();
  if (typeof cleanup === 'function') {
    try {
      cleanup();
    } catch {
      /* ignore */
    }
  }
  cleanup = null;

  document.querySelectorAll('[data-nav]').forEach((a) => {
    const active = a.dataset.nav === (page || 'home');
    a.classList.toggle('active', active);
    if (active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  document.body.dataset.page = page || 'home';

  const main = $('#main');
  const view = h('div', { class: 'view' });
  main.replaceChildren(view);
  setTitle('');
  window.scrollTo({ top: 0 });

  try {
    cleanup = await mod.render(view, r);
  } catch (err) {
    console.error(err);
    view.replaceChildren(h('div', { class: 'error-box' }, 'This page failed to load. ', h('a', { href: '#/' }, 'Go home')));
  }
}

function buildChrome() {
  const name = siteName();
  $('.brand-name').textContent = name;
  const navIcons = { home: 'home', movies: 'film', youtube: 'video', music: 'music', games: 'game' };
  document.querySelectorAll('[data-nav]').forEach((a) => {
    a.prepend(icon(navIcons[a.dataset.nav], 20));
  });
  mountPlayer($('#player'));
}

async function init() {
  try {
    window.__config = await api('config', { ttl: 60 });
  } catch {
    window.__config = { tmdb: false, youtube: false };
  }
  buildChrome();
  window.addEventListener('hashchange', route);
  route();
}

init();
