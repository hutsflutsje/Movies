// Music: free full-length songs (Audius), live radio (radio-browser.info),
// and a Spotify shelf that plays links through Spotify's official embedded player.
import { REGIONS, api, emptyState, errorView, flag, fmtTime, h, icon, img, searchBox, setTitle, skeleton, store, toast } from '../lib.js';
import { stationLogo } from '../cards.js';
import { current, playStation, playTracks } from '../player.js';

const TABS = [
  ['free', 'Free music', 'music'],
  ['radio', 'Live radio', 'radio'],
  ['spotify', 'Spotify links', 'link'],
];

const GENRES = ['Electronic', 'Hip-Hop/Rap', 'Lo-Fi', 'Pop', 'Rock', 'R&B/Soul', 'Alternative', 'Ambient', 'House', 'Techno', 'Trap', 'Drum & Bass', 'Dubstep', 'Jazz', 'Classical', 'Acoustic', 'Latin', 'Reggae', 'Metal', 'Country', 'Soundtrack'];

const RADIO_TAGS = ['', 'pop', 'rock', 'hiphop', 'dance', 'jazz', 'classical', 'chillout', 'lofi', 'news', 'country', '80s', 'oldies', 'reggae', 'metal', 'talk'];

export async function render(view, route) {
  const tab = TABS.some(([k]) => k === route.query.get('tab')) ? route.query.get('tab') : store.get('musicTab', 'free');
  const q = route.query.get('q') || '';
  store.set('musicTab', tab);
  setTitle(tab === 'radio' ? 'Live radio' : tab === 'spotify' ? 'Spotify links' : 'Free music');

  view.append(
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Music'), h('p', null, 'Free full-length songs from independent artists, thousands of live radio stations, and your Spotify links.'))),
    h(
      'div',
      { class: 'tabs', role: 'tablist' },
      TABS.map(([key, label, ic]) => h('a', { class: 'tab' + (key === tab ? ' active' : ''), href: `#/music?tab=${key}`, role: 'tab', 'aria-selected': String(key === tab) }, icon(ic, 18), label)),
    ),
  );

  const body = h('div');
  view.append(body);

  // Keep "now playing" highlights in sync with the global player
  const onChange = () => highlight(body);
  window.addEventListener('player:change', onChange);
  const cleanup = () => window.removeEventListener('player:change', onChange);

  if (tab === 'radio') renderRadio(body, q);
  else if (tab === 'spotify') renderSpotify(body);
  else renderFree(body, q);
  return cleanup;
}

function highlight(root) {
  const cur = current();
  root.querySelectorAll('[data-play-id]').forEach((el) => el.classList.toggle('playing', Boolean(cur) && el.dataset.playId === `${cur.kind}:${cur.id}`));
}

/* ---------- Free music (Audius) ---------- */

function renderFree(body, q) {
  const { form } = searchBox({
    placeholder: 'Search songs and artists…',
    value: q,
    onSubmit: (v) => (location.hash = v ? `#/music?tab=free&q=${encodeURIComponent(v)}` : '#/music?tab=free'),
  });
  body.append(form, h('div', { style: { height: '18px' } }));

  const list = h('div', { class: 'tracks' });
  const head = h('div', { class: 'toolbar' });

  async function load(path) {
    list.replaceChildren(...skeleton('line', 8));
    try {
      const d = await api(path, { ttl: 900 });
      list.replaceChildren();
      if (!d.items.length) {
        list.append(emptyState('No songs found', q ? `Nothing matched “${q}”.` : 'Try another genre.'));
        return;
      }
      head.querySelector('.play-all')?.remove();
      head.prepend(h('button', { class: 'btn btn-primary btn-sm play-all', onclick: () => playTracks(d.items, 0) }, icon('play', 16), 'Play all'));
      list.append(...d.items.map((t, i) => trackRow(t, i, d.items)));
      highlight(body);
    } catch (err) {
      list.replaceChildren(errorView(err, () => load(path)));
    }
  }

  if (q) {
    body.append(h('h2', { class: 'section-title' }, `Results for “${q}”`), head, list);
    load(`music/search?q=${encodeURIComponent(q)}`);
  } else {
    let genre = store.get('genre', '');
    let time = store.get('musicTime', 'week');
    const timeSel = h(
      'select',
      { class: 'select', 'aria-label': 'Time range' },
      [['week', 'This week'], ['month', 'This month'], ['year', 'This year'], ['allTime', 'All time']].map(([v, l]) => h('option', { value: v, selected: v === time }, l)),
    );
    const reload = () => load(`music/trending?time=${time}${genre ? `&genre=${encodeURIComponent(genre)}` : ''}`);
    timeSel.onchange = () => {
      time = timeSel.value;
      store.set('musicTime', time);
      reload();
    };
    const genreChips = h('div', { class: 'chips' });
    for (const g of ['', ...GENRES]) {
      const b = h('button', { class: 'chip' + (g === genre ? ' active' : '') }, g || 'All genres');
      b.onclick = () => {
        genre = g;
        store.set('genre', g);
        genreChips.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c === b));
        reload();
      };
      genreChips.append(b);
    }
    head.append(h('span', { class: 'spacer' }), timeSel);
    body.append(h('h2', { class: 'section-title' }, 'Trending'), genreChips, head, list);
    reload();
  }

  body.append(h('p', { class: 'muted', style: { fontSize: '12.5px', marginTop: '18px' } }, 'Songs stream directly from Audius, where artists share their music for free. Tap the ↗ in the player to support the artist.'));
}

function trackRow(t, i, list) {
  return h(
    'button',
    { class: 'track', type: 'button', dataset: { playId: `track:${t.id}` }, onclick: () => playTracks(list, i) },
    h('span', { class: 'track-num' }, h('span', { class: 'num' }, String(i + 1)), icon('play', 16)),
    h('span', { class: 'track-art' }, img(t.artwork, '')),
    h('span', { style: { minWidth: 0 } }, h('div', { class: 'track-title' }, t.title), h('div', { class: 'track-artist' }, t.artist)),
    h('span', { class: 'track-genre' }, t.genre),
    h('span', { class: 'track-dur' }, t.duration ? fmtTime(t.duration) : ''),
  );
}

/* ---------- Live radio ---------- */

function favs() {
  return store.get('stations', []);
}

function toggleFav(s) {
  const list = favs();
  const has = list.some((x) => x.id === s.id);
  store.set('stations', has ? list.filter((x) => x.id !== s.id) : [s, ...list].slice(0, 50));
  toast(has ? 'Removed from your stations' : 'Saved to your stations');
  return !has;
}

function stationCard(s) {
  const fav = h('button', { class: 'fav-btn' + (favs().some((x) => x.id === s.id) ? ' on' : ''), 'aria-label': 'Save station' });
  const paintFav = () => fav.replaceChildren(icon(fav.classList.contains('on') ? 'starFill' : 'star', 18));
  paintFav();
  fav.onclick = (e) => {
    e.stopPropagation();
    fav.classList.toggle('on', toggleFav(s));
    paintFav();
  };
  const meta = [s.countrycode && `${flag(s.countrycode)} ${s.countrycode}`, s.tags.slice(0, 3).join(', '), s.bitrate ? `${s.bitrate} kbps` : null].filter(Boolean).join(' · ');
  const card = h(
    'div',
    { class: 'station', role: 'button', tabindex: '0', dataset: { playId: `station:${s.id}` }, title: `Play ${s.name}` },
    stationLogo(s),
    h('div', { class: 'station-text' }, h('div', { class: 'station-name' }, s.name), h('div', { class: 'station-tags' }, meta)),
    fav,
  );
  card.onclick = () => playStation(s);
  card.onkeydown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      playStation(s);
    }
  };
  return card;
}

function renderRadio(body, q) {
  let tag = store.get('radioTag', '');
  let country = store.get('radioCountry', '');

  const { form } = searchBox({
    placeholder: 'Search stations by name…',
    value: q,
    onSubmit: (v) => (location.hash = v ? `#/music?tab=radio&q=${encodeURIComponent(v)}` : '#/music?tab=radio'),
  });

  const countrySel = h(
    'select',
    { class: 'select', 'aria-label': 'Country' },
    h('option', { value: '' }, '🌍 All countries'),
    Object.entries(REGIONS).map(([cc, name]) => h('option', { value: cc, selected: cc === country }, `${flag(cc)} ${name}`)),
  );

  const grid = h('div', { class: 'grid grid-station' });
  const load = async () => {
    grid.replaceChildren(...skeleton('line', 9));
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (tag) p.set('tag', tag);
    if (country) p.set('country', country);
    try {
      const d = await api(`radio/search?${p}`, { ttl: 1800 });
      grid.replaceChildren(...d.items.map(stationCard));
      if (!d.items.length) grid.append(emptyState('No stations found', 'Try a different genre or country.'));
      highlight(body);
    } catch (err) {
      grid.replaceChildren(errorView(err, load));
    }
  };

  countrySel.onchange = () => {
    country = countrySel.value;
    store.set('radioCountry', country);
    load();
  };

  const tagChips = h('div', { class: 'chips' });
  for (const t of RADIO_TAGS) {
    const b = h('button', { class: 'chip' + (t === tag ? ' active' : '') }, t ? t[0].toUpperCase() + t.slice(1) : 'Top stations');
    b.onclick = () => {
      tag = t;
      store.set('radioTag', t);
      tagChips.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c === b));
      load();
    };
    tagChips.append(b);
  }

  body.append(form, h('div', { style: { height: '18px' } }));

  const saved = favs();
  if (saved.length && !q) {
    body.append(h('h2', { class: 'section-title' }, icon('starFill', 18), 'Your stations'), h('div', { class: 'grid grid-station', style: { marginBottom: '28px' } }, saved.map(stationCard)));
  }

  body.append(h('div', { class: 'row-head' }, h('h2', { class: 'section-title', style: { margin: 0 } }, q ? `Stations matching “${q}”` : 'Browse stations'), countrySel));
  if (!q) body.append(tagChips);
  body.append(grid, h('p', { class: 'muted', style: { fontSize: '12.5px', marginTop: '18px' } }, 'Station directory by radio-browser.info. Streams come straight from each broadcaster.'));
  load();
}

/* ---------- Spotify links ---------- */

const SPOTIFY_TYPES = ['track', 'album', 'playlist', 'artist', 'episode', 'show'];

export function parseSpotify(input) {
  const s = input.trim();
  let m = s.match(/^spotify:(track|album|playlist|artist|episode|show):([A-Za-z0-9]{22})$/);
  if (m) return { type: m[1], id: m[2] };
  try {
    const u = new URL(s);
    if (u.hostname !== 'open.spotify.com') return null;
    const parts = u.pathname.split('/').filter(Boolean).filter((p) => !p.startsWith('intl-') && p !== 'embed');
    if (parts.length >= 2 && SPOTIFY_TYPES.includes(parts[0]) && /^[A-Za-z0-9]{22}$/.test(parts[1])) return { type: parts[0], id: parts[1] };
  } catch {
    /* not a URL */
  }
  return null;
}

function spotifyEmbed({ type, id }) {
  return h('iframe', {
    class: 'spotify-embed',
    src: `https://open.spotify.com/embed/${type}/${id}?theme=0`,
    height: type === 'track' || type === 'episode' ? '152' : '352',
    loading: 'lazy',
    allow: 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture',
    title: `Spotify ${type}`,
  });
}

function renderSpotify(body) {
  const shelf = h('div', { class: 'shelf' });
  const paint = () => {
    const items = store.get('spotify', []);
    shelf.replaceChildren(
      ...items.map((it) =>
        h(
          'div',
          { class: 'shelf-item' },
          h(
            'button',
            {
              class: 'icon-btn remove',
              'aria-label': 'Remove',
              title: 'Remove',
              onclick: () => {
                store.set('spotify', store.get('spotify', []).filter((x) => !(x.id === it.id && x.type === it.type)));
                paint();
              },
            },
            icon('close', 16),
          ),
          spotifyEmbed(it),
        ),
      ),
    );
    if (!items.length) shelf.append(emptyState('Your Spotify shelf is empty', 'In Spotify, use Share → Copy link on any song, album, playlist or podcast, then paste it above.'));
  };

  const input = h('input', { class: 'search-input', type: 'url', placeholder: 'Paste a Spotify link (song, album, playlist, podcast)…', 'aria-label': 'Spotify link' });
  const form = h('form', { class: 'search' }, icon('link'), input, h('button', { class: 'btn btn-primary', type: 'submit' }, 'Add'));
  form.onsubmit = (e) => {
    e.preventDefault();
    const parsed = parseSpotify(input.value);
    if (!parsed) {
      toast("That doesn't look like a Spotify link.", 'error');
      return;
    }
    const items = store.get('spotify', []).filter((x) => !(x.id === parsed.id && x.type === parsed.type));
    store.set('spotify', [parsed, ...items].slice(0, 30));
    input.value = '';
    paint();
  };

  body.append(
    h('div', { class: 'notice' }, icon('info', 18), h('span', null, "Links play in Spotify's own embedded player, so what you can hear (full songs or previews) depends on whether you're logged in to Spotify in this browser. For free, full-length songs with no ads, use the Free music tab.")),
    form,
    shelf,
  );
  paint();
}
