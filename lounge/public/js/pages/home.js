import { api, fill, getHistory, h, icon, region, rowSection, setTitle } from '../lib.js';
import { archiveCard, gameCard, historyCard, posterCard, trackTile, videoCard } from '../cards.js';
import { loadGames } from './games.js';

const SEARCH_TARGETS = [
  ['movies', 'Movies & TV', 'Search movies & shows…'],
  ['youtube', 'YouTube', 'Search YouTube or paste a link…'],
  ['music', 'Music', 'Search free music…'],
];

function hero() {
  let target = 'movies';
  const input = h('input', { class: 'search-input', type: 'search', placeholder: SEARCH_TARGETS[0][2], enterkeyhint: 'search', 'aria-label': 'Search' });
  const tabs = h('div', { class: 'tabs', role: 'tablist' });
  for (const [key, label, placeholder] of SEARCH_TARGETS) {
    const b = h('button', { class: 'tab' + (key === target ? ' active' : ''), type: 'button', role: 'tab' }, label);
    b.onclick = () => {
      target = key;
      input.placeholder = placeholder;
      tabs.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === b));
      input.focus();
    };
    tabs.append(b);
  }
  const form = h('form', { class: 'search', role: 'search' }, icon('search'), input, h('button', { class: 'btn btn-primary', type: 'submit' }, 'Search'));
  form.onsubmit = (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    location.hash = `#/${target}?q=${encodeURIComponent(q)}`;
  };

  const hour = new Date().getHours();
  const greeting = hour < 5 ? 'Up late?' : hour < 12 ? 'Good morning.' : hour < 18 ? 'Good afternoon.' : 'Good evening.';
  const question = hour >= 5 && hour < 17 ? 'What are we watching today?' : 'What are we doing tonight?';

  return h(
    'section',
    { class: 'hero' },
    h('h1', null, greeting, ' ', h('span', null, question)),
    h('p', null, 'Classic movies, where-to-stream info, a clean YouTube player, free music, live radio and games, all in one place.'),
    tabs,
    form,
  );
}

function quickLinks() {
  const items = [
    ['#/movies', 'film', 'Movies & TV', 'Free classics + where to stream', 'rgba(139,123,255,.18)', '#a99dff'],
    ['#/youtube', 'video', 'YouTube', 'Search & watch', 'rgba(255,93,108,.16)', '#ff7d89'],
    ['#/music', 'music', 'Music & Radio', 'Free songs & live stations', 'rgba(61,220,151,.14)', '#5fe3a8'],
    ['#/games', 'game', 'Games', 'Play in your browser', 'rgba(255,181,71,.15)', '#ffc46b'],
  ];
  return h(
    'div',
    { class: 'quick-links' },
    items.map(([href, ic, title, sub, bg, fg]) =>
      h('a', { class: 'quick', href }, h('span', { class: 'quick-icon', style: { background: bg, color: fg } }, icon(ic, 22)), h('span', null, title, h('small', null, sub))),
    ),
  );
}

export async function render(view) {
  setTitle('');
  const cfg = window.__config || {};
  view.append(hero(), quickLinks());

  const history = getHistory();
  if (history.length) {
    const row = rowSection('Jump back in', { kind: 'square' });
    row.body.replaceChildren(...history.slice(0, 16).map(historyCard));
    view.append(row.el);
  }

  const classics = rowSection('Free classic movies', { subtitle: 'Public-domain films that play right here', link: '#/movies', kind: 'poster' });
  view.append(classics.el);
  fill(classics.body, () => api('archive/search?cat=popular&rows=24', { ttl: 3600 }), (d) => d.items.map(archiveCard));

  if (cfg.tmdb) {
    const trending = rowSection('Trending movies & shows', { subtitle: 'See where to stream them', link: '#/movies', kind: 'poster' });
    view.append(trending.el);
    fill(trending.body, () => api('tmdb/trending/all/week', { ttl: 1800 }), (d) => d.results.filter((r) => r.media_type !== 'person').map((r) => posterCard(r)));
  }

  const music = rowSection('Trending free music', { subtitle: 'Full songs from independent artists on Audius', link: '#/music', kind: 'square' });
  view.append(music.el);
  fill(music.body, () => api('music/trending?time=week', { ttl: 900 }), (d) => d.items.slice(0, 24).map((t, i, list) => trackTile(t, list, i)));

  const games = rowSection('Games', { subtitle: 'Original browser games, no downloads', link: '#/games', kind: 'game' });
  view.append(games.el);
  fill(games.body, loadGames, (list) => list.map(gameCard));

  if (cfg.youtube) {
    const yt = rowSection('Popular on YouTube', { link: '#/youtube', kind: 'video' });
    view.append(yt.el);
    fill(yt.body, () => api(`youtube/trending?region=${region.get()}`, { ttl: 1800 }), (d) => d.items.map((v) => videoCard(v)));
  }
}
