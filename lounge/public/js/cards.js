// Card components shared by several pages.
import { addHistory, fmtCount, fmtTime, h, icon, img, timeAgo } from './lib.js';
import { openTheater, playStation, playTracks } from './player.js';

/* ---------- TMDB (movies & TV) ---------- */

export const tmdbImg = (path, size = 'w342') => (path ? `https://image.tmdb.org/t/p/${size}${path}` : null);
export const tmdbTitle = (it) => it.title || it.name || 'Untitled';
export const tmdbYear = (it) => (it.release_date || it.first_air_date || '').slice(0, 4);
export const tmdbType = (it, fallback = 'movie') => (it.media_type === 'tv' || it.media_type === 'movie' ? it.media_type : fallback);

export function posterCard(it, fallbackType) {
  const type = tmdbType(it, fallbackType);
  const rating = it.vote_average ? it.vote_average.toFixed(1) : null;
  return h(
    'a',
    { class: 'card', href: `#/movies/${type}/${it.id}`, title: tmdbTitle(it) },
    h(
      'div',
      { class: 'card-media ratio-poster' },
      img(tmdbImg(it.poster_path), tmdbTitle(it)),
      type === 'tv' && h('span', { class: 'badge badge-tl' }, 'TV'),
    ),
    h(
      'div',
      { class: 'card-body' },
      h('div', { class: 'card-title clamp-2' }, tmdbTitle(it)),
      h('div', { class: 'card-meta' }, tmdbYear(it), rating && rating !== '0.0' && h('span', { class: 'rating' }, '★ ', rating)),
    ),
  );
}

/* ---------- Internet Archive (public-domain films) ---------- */

export function playArchive(item) {
  addHistory({ kind: 'archive', id: item.id, title: item.title, subtitle: item.year ? String(item.year) : 'Classic film', thumb: item.thumb, data: item });
  openTheater({
    title: item.title + (item.year ? ` (${item.year})` : ''),
    subtitle: item.description,
    embed: item.embed,
    link: item.url,
    linkLabel: 'View on Internet Archive',
  });
}

export function archiveCard(item) {
  return h(
    'button',
    { class: 'card', type: 'button', title: item.title, onclick: () => playArchive(item) },
    h(
      'div',
      { class: 'card-media ratio-poster' },
      img(item.thumb, item.title),
      h('span', { class: 'badge badge-tl badge-free' }, 'FREE'),
      h('div', { class: 'card-play' }, icon('play', 22)),
    ),
    h(
      'div',
      { class: 'card-body' },
      h('div', { class: 'card-title clamp-2' }, item.title),
      h('div', { class: 'card-meta' }, item.year || 'Classic', item.runtime && h('span', null, item.runtime)),
    ),
  );
}

/* ---------- YouTube ---------- */

export function videoCard(v, { compact = false } = {}) {
  const meta = [v.views != null ? `${fmtCount(v.views)} views` : null, v.published ? timeAgo(v.published) : null].filter(Boolean).join(' · ');
  return h(
    'a',
    { class: compact ? 'mini-video' : 'card', href: `#/youtube/watch?v=${encodeURIComponent(v.id)}`, title: v.title, dataset: { vid: v.id } },
    h(
      'div',
      { class: 'card-media ratio-video' },
      img(v.thumb, ''),
      v.live ? h('span', { class: 'badge badge-br badge-live' }, 'LIVE') : v.duration ? h('span', { class: 'badge badge-br' }, fmtTime(v.duration)) : null,
    ),
    h(
      'div',
      { class: compact ? '' : 'card-body' },
      h('div', { class: 'card-title clamp-2' }, v.title),
      h('div', { class: 'card-meta' }, v.channel),
      meta && h('div', { class: 'card-meta' }, meta),
    ),
  );
}

/* ---------- Music ---------- */

export function trackTile(track, list, index) {
  return h(
    'button',
    { class: 'card', type: 'button', title: `${track.title} — ${track.artist}`, onclick: () => playTracks(list, index) },
    h('div', { class: 'card-media ratio-square' }, img(track.artwork, ''), h('div', { class: 'card-play' }, icon('play', 22))),
    h('div', { class: 'card-body' }, h('div', { class: 'card-title clamp-2' }, track.title), h('div', { class: 'card-meta' }, track.artist)),
  );
}

export function stationLogo(s) {
  const initial = h('div', { class: 'initial' }, (s.name || '?').trim().charAt(0).toUpperCase());
  if (!s.favicon) return h('div', { class: 'station-logo' }, initial);
  const el = h('img', { src: s.favicon, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' });
  el.addEventListener('error', () => el.replaceWith(initial), { once: true });
  return h('div', { class: 'station-logo' }, el);
}

/* ---------- Games ---------- */

export function gameCard(g) {
  const isLink = g.type === 'link';
  return h(
    'a',
    isLink
      ? { class: 'card game-card', href: g.src, target: '_blank', rel: 'noopener' }
      : { class: 'card game-card', href: `#/games/${encodeURIComponent(g.id)}` },
    h(
      'div',
      { class: 'card-media ratio-game' },
      img(g.cover, g.title),
      g.badge && h('span', { class: 'badge badge-tl' }, g.badge),
      h('div', { class: 'card-play' }, icon(isLink ? 'external' : 'play', 22)),
    ),
    h(
      'div',
      { class: 'card-body' },
      h('div', { class: 'card-title' }, g.title),
      g.description && h('div', { class: 'card-desc clamp-2' }, g.description),
      g.tags?.length && h('div', { class: 'tags' }, g.tags.map((t) => h('span', { class: 'tag' }, t))),
    ),
  );
}

/* ---------- History ("Jump back in") ---------- */

export function historyCard(item) {
  const thumbCls = 'ratio-square';
  const open = () => {
    if (item.kind === 'youtube') location.hash = `#/youtube/watch?v=${encodeURIComponent(item.id)}`;
    else if (item.kind === 'archive') playArchive(item.data);
    else if (item.kind === 'track') playTracks([item.data], 0);
    else if (item.kind === 'station') playStation(item.data);
    else if (item.kind === 'game') location.hash = `#/games/${encodeURIComponent(item.id)}`;
  };
  const label = { youtube: 'YouTube', archive: 'Film', track: 'Song', station: 'Radio', game: 'Game' }[item.kind] || '';
  return h(
    'button',
    { class: 'card', type: 'button', onclick: open, title: item.title },
    h(
      'div',
      { class: `card-media ${thumbCls}` },
      item.kind === 'station' ? stationLogo(item.data || {}) : img(item.thumb, ''),
      h('span', { class: 'badge badge-tl' }, label),
      h('div', { class: 'card-play' }, icon('play', 22)),
    ),
    h('div', { class: 'card-body' }, h('div', { class: 'card-title clamp-2' }, item.title), item.subtitle && h('div', { class: 'card-meta' }, item.subtitle)),
  );
}
