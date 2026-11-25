// YouTube: search (official Data API), popular videos, paste-a-link, and a clean watch page
// that uses YouTube's official privacy-enhanced embedded player.
import {
  addHistory, api, chips, emptyState, errorView, fill, getHistory, h, icon, region,
  rowSection, searchBox, setTitle, setupCard, skeleton,
} from '../lib.js';
import { videoCard } from '../cards.js';
import { pauseForVideo } from '../player.js';

const CATEGORIES = [
  ['', 'Popular'],
  ['10', 'Music'],
  ['20', 'Gaming'],
  ['17', 'Sports'],
  ['24', 'Entertainment'],
  ['23', 'Comedy'],
  ['28', 'Science & Tech'],
  ['1', 'Film & Animation'],
];

/** Remember the last list of videos so the watch page can show "Up next". */
function rememberList(items) {
  try {
    sessionStorage.setItem('yt:last', JSON.stringify(items.slice(0, 50)));
  } catch {
    /* ignore */
  }
}

function lastList() {
  try {
    return JSON.parse(sessionStorage.getItem('yt:last') || '[]');
  } catch {
    return [];
  }
}

/** Accepts youtube.com/watch?v=, youtu.be/, /shorts/, /embed/, /live/ and playlist links. */
export function parseYouTube(input) {
  if (!/youtu\.?be/i.test(input)) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(input) ? input : 'https://' + input);
    const host = u.hostname.replace(/^(www|m|music)\./, '');
    let id = null;
    if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
    else if (/(^|\.)youtube(-nocookie)?\.com$/.test(host)) {
      if (u.pathname === '/watch') id = u.searchParams.get('v');
      else {
        const m = u.pathname.match(/^\/(embed|shorts|live|v)\/([\w-]{11})/);
        if (m) id = m[2];
      }
    } else return null;
    if (id && !/^[\w-]{11}$/.test(id)) id = null;
    const list = (u.searchParams.get('list') || '').replace(/[^\w-]/g, '') || null;
    const t = parseInt(u.searchParams.get('t') || u.searchParams.get('start') || '0', 10) || 0;
    if (!id && !list) return null;
    return { id, list, t };
  } catch {
    return null;
  }
}

function watchHash({ id, list, t }) {
  const p = new URLSearchParams();
  if (id) p.set('v', id);
  if (list) p.set('list', list);
  if (t) p.set('t', String(t));
  return `#/youtube/watch?${p}`;
}

export async function render(view, route) {
  if (route.parts[0] === 'watch') return renderWatch(view, route.query);
  const q = route.query.get('q') || '';
  const link = q && parseYouTube(q);
  if (link) {
    location.replace(watchHash(link));
    return;
  }
  return renderBrowse(view, q);
}

function header(q) {
  const { form } = searchBox({
    placeholder: 'Search YouTube or paste a link…',
    value: q,
    autofocus: !q,
    onSubmit: (v) => {
      const link = parseYouTube(v);
      if (link) location.hash = watchHash(link);
      else location.hash = v ? `#/youtube?q=${encodeURIComponent(v)}` : '#/youtube';
    },
  });
  return [
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'YouTube'), h('p', null, 'Search and watch in a clean, distraction-free player. No feeds, no comments, no autoplay rabbit holes.'))),
    form,
  ];
}

function renderBrowse(view, q) {
  setTitle(q ? `“${q}” on YouTube` : 'YouTube');
  const cfg = window.__config || {};
  view.append(...header(q));

  const recent = getHistory().filter((x) => x.kind === 'youtube');

  if (!cfg.youtube) {
    view.append(h('div', { class: 'section' }, setupCard('youtube')));
    if (recent.length) view.append(recentRow(recent));
    return;
  }

  if (q) {
    const grid = h('div', { class: 'grid grid-video' }, skeleton('video', 12));
    const moreWrap = h('div', { class: 'load-more' });
    view.append(h('section', { class: 'section' }, grid, moreWrap));
    let all = [];
    const load = async (token) => {
      try {
        const d = await api(`youtube/search?q=${encodeURIComponent(q)}${token ? `&pageToken=${encodeURIComponent(token)}` : ''}`, { ttl: 1800 });
        if (!token) grid.replaceChildren();
        all = all.concat(d.items);
        rememberList(all);
        grid.append(...d.items.map((v) => videoCard(v)));
        if (!grid.childElementCount) grid.append(emptyState('No videos found', `Nothing matched “${q}”.`));
        moreWrap.replaceChildren();
        if (d.nextPageToken) {
          const more = h('button', { class: 'btn btn-ghost' }, 'Load more');
          more.onclick = () => {
            more.disabled = true;
            load(d.nextPageToken);
          };
          moreWrap.append(more);
        }
      } catch (err) {
        (token ? moreWrap : grid).replaceChildren(errorView(err, () => load(token)));
      }
    };
    load(null);
    return;
  }

  if (recent.length) view.append(recentRow(recent));

  const grid = h('div', { class: 'grid grid-video' });
  const loadCat = (cat) => {
    grid.replaceChildren(...skeleton('video', 12));
    fill(
      grid,
      () => api(`youtube/trending?region=${region.get()}${cat ? `&category=${cat}` : ''}`, { ttl: 1800 }),
      (d) => {
        rememberList(d.items);
        return d.items.map((v) => videoCard(v));
      },
      { onEmpty: () => emptyState('Nothing here right now', 'Try another category.') },
    );
  };
  view.append(h('section', { class: 'section' }, chips(CATEGORIES, '', loadCat), grid));
  loadCat('');
}

function recentRow(recent) {
  const row = rowSection('Recently watched', { kind: 'video' });
  row.body.replaceChildren(
    ...recent.slice(0, 16).map((x) => videoCard({ id: x.id, title: x.title, channel: x.subtitle, thumb: x.thumb })),
  );
  return row.el;
}

function renderWatch(view, query) {
  const id = (query.get('v') || '').replace(/[^\w-]/g, '').slice(0, 11) || null;
  const list = (query.get('list') || '').replace(/[^\w-]/g, '') || null;
  const t = parseInt(query.get('t') || '0', 10) || 0;
  if (!id && !list) {
    location.replace('#/youtube');
    return;
  }
  pauseForVideo();

  const params = new URLSearchParams({ autoplay: '1', rel: '0', playsinline: '1' });
  if (list) params.set('list', list);
  if (t) params.set('start', String(t));
  const src = id
    ? `https://www.youtube-nocookie.com/embed/${id}?${params}`
    : `https://www.youtube-nocookie.com/embed/videoseries?${params}`;

  const known = lastList().find((v) => v.id === id) || getHistory().find((x) => x.kind === 'youtube' && x.id === id);
  const titleEl = h('h1', { class: 'watch-title' }, known?.title || (id ? 'Loading…' : 'Playlist'));
  const channelEl = h('span', null, known?.channel || known?.subtitle || '');
  const ytUrl = id ? `https://www.youtube.com/watch?v=${id}${list ? `&list=${list}` : ''}` : `https://www.youtube.com/playlist?list=${list}`;

  const record = (title, channel) => {
    if (!id) return;
    addHistory({ kind: 'youtube', id, title: title || 'YouTube video', subtitle: channel || '', thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` });
    setTitle(title || 'YouTube');
  };

  if (known?.title) record(known.title, known.channel || known.subtitle);
  else if (id) {
    api(`youtube/info?id=${id}`, { ttl: 86400 })
      .then((info) => {
        titleEl.textContent = info.title || 'YouTube video';
        channelEl.textContent = info.channel || '';
        record(info.title, info.channel);
      })
      .catch(() => {
        titleEl.textContent = 'YouTube video';
        record(null, null);
      });
  } else setTitle('YouTube playlist');

  const upNext = h('div', { class: 'up-next' });
  const items = lastList().filter((v) => v.id !== id);
  if (items.length) {
    upNext.append(...items.slice(0, 30).map((v) => videoCard(v, { compact: true })));
  } else {
    const recent = getHistory().filter((x) => x.kind === 'youtube' && x.id !== id);
    if (recent.length) upNext.append(...recent.map((x) => videoCard({ id: x.id, title: x.title, channel: x.subtitle, thumb: x.thumb }, { compact: true })));
    else upNext.append(h('p', { class: 'muted' }, 'Search for something to build an up-next list.'));
  }

  view.append(
    h('a', { class: 'back-link', href: '#/youtube', onclick: (e) => (e.preventDefault(), history.length > 1 ? history.back() : (location.hash = '#/youtube')) }, icon('back', 18), 'Back'),
    h(
      'div',
      { class: 'watch' },
      h(
        'div',
        null,
        h(
          'div',
          { class: 'watch-player' },
          h('iframe', {
            src,
            title: 'YouTube video player',
            allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen; web-share',
            allowfullscreen: true,
            referrerpolicy: 'strict-origin-when-cross-origin',
          }),
        ),
        titleEl,
        h(
          'div',
          { class: 'watch-meta' },
          channelEl,
          h('a', { class: 'btn btn-ghost btn-sm', href: ytUrl, target: '_blank', rel: 'noopener' }, icon('external', 16), 'Open on YouTube'),
        ),
      ),
      h('aside', null, h('h2', { class: 'section-title' }, 'Up next'), upNext),
    ),
  );
}
