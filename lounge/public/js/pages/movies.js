// Movies & TV
//  - Free public-domain films that play on the site (Internet Archive, no key needed)
//  - Search, trending and details for any movie/show + where to stream it legally (TMDB + JustWatch)
import {
  REGIONS, api, chips, emptyState, errorView, fill, flag, h, icon, img, region, regionSelect,
  rowSection, searchBox, setTitle, setupCard, skeleton, store,
} from '../lib.js';
import { archiveCard, playArchive, posterCard, tmdbImg, tmdbTitle, tmdbYear } from '../cards.js';
import { openTheater } from '../player.js';

const CLASSIC_CATS = [
  ['popular', 'Most watched'],
  ['scifi', 'Sci-fi & horror'],
  ['noir', 'Film noir'],
  ['comedy', 'Comedy'],
  ['western', 'Westerns'],
  ['tv', 'Classic TV'],
  ['cartoons', 'Cartoons'],
  ['silent', 'Silent era'],
];

export async function render(view, route) {
  const [type, id] = route.parts;
  if ((type === 'movie' || type === 'tv') && /^\d+$/.test(id || '')) return renderDetail(view, type, id);
  return renderBrowse(view, route.query.get('q') || '');
}

/* ========================================================================== */
/* Browse + search                                                             */
/* ========================================================================== */

function renderBrowse(view, q) {
  setTitle(q ? `“${q}” in Movies & TV` : 'Movies & TV');
  const cfg = window.__config || {};

  const { form } = searchBox({
    placeholder: 'Search movies & TV shows…',
    value: q,
    autofocus: !q,
    onSubmit: (v) => (location.hash = v ? `#/movies?q=${encodeURIComponent(v)}` : '#/movies'),
  });

  view.append(
    h(
      'div',
      { class: 'page-head' },
      h('div', null, h('h1', null, 'Movies & TV'), h('p', null, 'Watch public-domain classics right here, or look up any title to see where it streams legally, including free ad-supported services.')),
      h('label', { class: 'toolbar', style: { margin: 0 } }, h('span', { class: 'muted' }, 'Country'), regionSelect(() => location.reload())),
    ),
    form,
  );

  if (q) return renderSearch(view, q, cfg);

  const myList = store.get('mylist', []);
  if (myList.length) {
    const row = rowSection('My List', { kind: 'poster' });
    row.body.replaceChildren(...myList.map((it) => posterCard(it, it.media_type)));
    view.append(row.el);
  }

  if (cfg.tmdb) {
    const rc = region.get();
    const country = REGIONS[rc] || rc;
    const freeMovies = rowSection(`Free to stream in ${country}`, { subtitle: 'Movies on free, ad-supported services (Tubi, Pluto TV, Plex, Roku…)', kind: 'poster' });
    const freeTv = rowSection(`Free TV shows in ${country}`, { subtitle: 'Series you can stream free with ads', kind: 'poster' });
    const trending = rowSection('Trending this week', { kind: 'poster' });
    view.append(freeMovies.el, freeTv.el, trending.el);
    const discover = (kind) => `tmdb/discover/${kind}?watch_region=${rc}&with_watch_monetization_types=free|ads&sort_by=popularity.desc&page=1`;
    const none = () => emptyState('Nothing listed for this country', 'Try another country in the menu above.');
    fill(freeMovies.body, () => api(discover('movie'), { ttl: 3600 }), (d) => d.results.map((r) => posterCard(r, 'movie')), { onEmpty: none });
    fill(freeTv.body, () => api(discover('tv'), { ttl: 3600 }), (d) => d.results.map((r) => posterCard(r, 'tv')), { onEmpty: none });
    fill(trending.body, () => api('tmdb/trending/all/week', { ttl: 1800 }), (d) => d.results.filter((r) => r.media_type !== 'person').map((r) => posterCard(r)));
  } else {
    view.append(h('div', { class: 'section' }, setupCard('tmdb')));
  }

  view.append(classicsBrowser());
}

function classicsBrowser() {
  let cat = store.get('classicsCat', 'popular');
  if (!CLASSIC_CATS.some(([k]) => k === cat)) cat = 'popular';
  let page = 1;
  const grid = h('div', { class: 'grid grid-poster' });
  const more = h('button', { class: 'btn btn-ghost' }, 'Load more');
  const moreWrap = h('div', { class: 'load-more' }, more);

  async function load(reset) {
    if (reset) {
      page = 1;
      grid.replaceChildren(...skeleton('poster', 12));
    }
    more.disabled = true;
    try {
      const d = await api(`archive/search?cat=${cat}&page=${page}&rows=24`, { ttl: 3600 });
      if (reset) grid.replaceChildren();
      grid.append(...d.items.map(archiveCard));
      if (!grid.childElementCount) grid.append(emptyState('No films found', 'Try another category.'));
      moreWrap.hidden = page * 24 >= d.total || d.items.length < 24;
    } catch (err) {
      if (reset) grid.replaceChildren(errorView(err, () => load(true)));
      else moreWrap.replaceChildren(errorView(err, () => load(false)));
    } finally {
      more.disabled = false;
    }
  }
  more.onclick = () => {
    page++;
    load(false);
  };

  load(true);
  return h(
    'section',
    { class: 'section', id: 'classics' },
    h('h2', { class: 'section-title' }, icon('film', 20), 'Classic films, free to play here'),
    h('p', { class: 'muted', style: { marginTop: '-6px' } }, 'Public-domain movies and TV from the Internet Archive, legally free to watch.'),
    chips(CLASSIC_CATS, cat, (v) => {
      cat = v;
      store.set('classicsCat', v);
      load(true);
    }),
    grid,
    moreWrap,
  );
}

function renderSearch(view, q, cfg) {
  if (cfg.tmdb) {
    const tmdbGrid = h('div', { class: 'grid grid-poster' }, skeleton('poster', 12));
    view.append(h('section', { class: 'section' }, h('h2', { class: 'section-title' }, 'Movies & shows'), tmdbGrid));
    fill(
      tmdbGrid,
      () => api(`tmdb/search/multi?query=${encodeURIComponent(q)}&page=1`, { ttl: 3600 }),
      (d) => d.results.filter((r) => r.media_type === 'movie' || r.media_type === 'tv').map((r) => posterCard(r)),
      { onEmpty: () => emptyState('No movies or shows found', `Nothing matched “${q}”.`) },
    );
  } else {
    view.append(h('div', { class: 'section' }, setupCard('tmdb')));
  }

  const iaGrid = h('div', { class: 'grid grid-poster' }, skeleton('poster', 6));
  view.append(
    h(
      'section',
      { class: 'section' },
      h('h2', { class: 'section-title' }, icon('play', 18), 'Free to watch here'),
      h('p', { class: 'muted', style: { marginTop: '-6px' } }, 'Public-domain matches from the Internet Archive.'),
      iaGrid,
    ),
  );
  fill(iaGrid, () => api(`archive/search?q=${encodeURIComponent(q)}&rows=24`, { ttl: 3600 }), (d) => d.items.map(archiveCard), {
    onEmpty: () => emptyState('No free public-domain matches', 'Most newer films are still under copyright. Check “where to watch” on a title instead.'),
  });
}

/* ========================================================================== */
/* Detail page                                                                 */
/* ========================================================================== */

async function renderDetail(view, type, id) {
  const cfg = window.__config || {};
  view.append(h('a', { class: 'back-link', href: '#/movies' }, icon('back', 18), 'Movies & TV'));
  if (!cfg.tmdb) {
    view.append(setupCard('tmdb'));
    return;
  }
  const holder = h('div', null, h('div', { class: 'skel', style: { height: '380px', borderRadius: '18px' } }));
  view.append(holder);

  let d;
  try {
    d = await api(`tmdb/${type}/${id}?append_to_response=videos,credits,recommendations,watch/providers`, { ttl: 3600 });
  } catch (err) {
    holder.replaceChildren(errorView(err, () => location.reload()));
    return;
  }
  const title = tmdbTitle(d);
  const year = tmdbYear(d);
  setTitle(title);

  const runtime =
    type === 'movie'
      ? d.runtime
        ? `${Math.floor(d.runtime / 60)}h ${d.runtime % 60}m`.replace(/^0h /, '')
        : null
      : d.number_of_seasons
        ? `${d.number_of_seasons} season${d.number_of_seasons > 1 ? 's' : ''}`
        : null;
  const trailer = pickTrailer(d.videos?.results || []);

  const freeHere = h('div');
  const actions = h(
    'div',
    { class: 'detail-actions' },
    trailer &&
      h(
        'button',
        {
          class: 'btn btn-light',
          onclick: () =>
            openTheater({
              title: `${title} — ${trailer.name || 'Trailer'}`,
              embed: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(trailer.key)}?autoplay=1&rel=0&playsinline=1`,
              link: `https://www.youtube.com/watch?v=${encodeURIComponent(trailer.key)}`,
              linkLabel: 'Open on YouTube',
            }),
        },
        icon('play', 18),
        'Play trailer',
      ),
    myListButton({ id: d.id, media_type: type, title, poster_path: d.poster_path, release_date: d.release_date, first_air_date: d.first_air_date, vote_average: d.vote_average }),
  );

  const hero = h(
    'section',
    { class: 'detail-hero' },
    h('div', { class: 'detail-backdrop' }, d.backdrop_path ? img(tmdbImg(d.backdrop_path, 'w1280'), '') : null),
    h(
      'div',
      { class: 'detail-main' },
      h('div', { class: 'detail-poster' }, img(tmdbImg(d.poster_path, 'w500'), title)),
      h(
        'div',
        { class: 'detail-info' },
        h('h1', null, title),
        h(
          'div',
          { class: 'detail-facts' },
          year && h('span', null, year),
          runtime && h('span', null, runtime),
          (d.genres || []).length > 0 && h('span', null, d.genres.map((g) => g.name).slice(0, 3).join(', ')),
          d.vote_average > 0 && h('span', { class: 'rating' }, `★ ${d.vote_average.toFixed(1)}`),
        ),
        d.tagline && h('p', { class: 'detail-tagline' }, d.tagline),
        h('p', { class: 'detail-overview' }, d.overview || 'No description available.'),
        actions,
        freeHere,
      ),
    ),
  );

  holder.replaceChildren(hero, whereToWatch(d, title));
  const seasonsEl = type === 'tv' && d.seasons?.length ? seasonsSection(id, d.seasons) : null;
  if (seasonsEl) holder.append(seasonsEl);

  const cast = (d.credits?.cast || []).slice(0, 18);
  if (cast.length) {
    const row = rowSection('Cast', { kind: 'poster' });
    row.body.classList.add('cast');
    row.body.replaceChildren(
      ...cast.map((p) =>
        h('div', { class: 'person' }, h('div', { class: 'card-media' }, img(tmdbImg(p.profile_path, 'w185'), p.name)), p.name, h('small', null, p.character || p.roles?.[0]?.character || '')),
      ),
    );
    holder.append(row.el);
  }

  const recs = (d.recommendations?.results || []).filter((r) => r.poster_path);
  if (recs.length) {
    const row = rowSection('More like this', { kind: 'poster' });
    row.body.replaceChildren(...recs.map((r) => posterCard(r, type)));
    holder.append(row.el);
  }

  if (type === 'movie') findPublicDomainCopy(title, year, freeHere);
}

function pickTrailer(videos) {
  const yt = videos.filter((v) => v.site === 'YouTube' && v.key);
  return (
    yt.find((v) => v.type === 'Trailer' && v.official) ||
    yt.find((v) => v.type === 'Trailer') ||
    yt.find((v) => v.type === 'Teaser') ||
    yt[0] ||
    null
  );
}

function myListButton(item) {
  const has = () => store.get('mylist', []).some((x) => x.id === item.id && x.media_type === item.media_type);
  const btn = h('button', { class: 'btn btn-ghost' });
  const paint = () => btn.replaceChildren(icon(has() ? 'check' : 'plus', 18), has() ? 'In My List' : 'My List');
  btn.onclick = () => {
    const list = store.get('mylist', []).filter((x) => !(x.id === item.id && x.media_type === item.media_type));
    if (!has()) list.unshift(item);
    store.set('mylist', list.slice(0, 60));
    paint();
  };
  paint();
  return btn;
}

const PROVIDER_GROUPS = [
  ['free', 'Free', true],
  ['ads', 'Free with ads', true],
  ['flatrate', 'Subscription', false],
  ['rent', 'Rent', false],
  ['buy', 'Buy', false],
];

function whereToWatch(d, title) {
  const rc = region.get();
  const all = d['watch/providers']?.results || {};
  const r = all[rc];
  const body = h('div', { class: 'providers' });

  if (!r) {
    const elsewhere = Object.keys(all).filter((c) => REGIONS[c]);
    body.append(h('p', { class: 'muted', style: { margin: 0 } }, `${title} isn't listed on any streaming service in ${REGIONS[rc] || rc} right now.`));
    if (elsewhere.length) {
      body.append(h('p', { class: 'muted', style: { margin: 0 } }, 'Listed in: ', elsewhere.slice(0, 12).map((c) => `${flag(c)} ${c}`).join('  ')));
    }
  } else {
    for (const [key, label, free] of PROVIDER_GROUPS) {
      const list = r[key] || [];
      if (!list.length) continue;
      body.append(
        h(
          'div',
          { class: 'provider-group' + (free ? ' free' : '') },
          h('h4', null, label),
          h(
            'div',
            { class: 'provider-list' },
            list.map((p) => h('a', { class: 'provider', href: r.link, target: '_blank', rel: 'noopener', title: `Find ${title} on ${p.provider_name}` }, img(tmdbImg(p.logo_path, 'w92'), ''), p.provider_name)),
          ),
        ),
      );
    }
    if (r.link) body.append(h('div', null, h('a', { class: 'btn btn-ghost btn-sm', href: r.link, target: '_blank', rel: 'noopener' }, icon('external', 16), 'Open streaming links')));
  }

  return h(
    'section',
    { class: 'section' },
    h(
      'div',
      { class: 'row-head' },
      h('h2', { class: 'section-title', style: { margin: 0 } }, icon('tv', 20), `Where to watch in ${REGIONS[rc] || rc}`),
      regionSelect(() => location.reload()),
    ),
    h('div', { class: 'panel' }, body),
    h('p', { class: 'muted', style: { fontSize: '12.5px' } }, 'Streaming data by JustWatch via TMDB.'),
  );
}

function seasonsSection(tvId, seasons) {
  const list = seasons.filter((s) => s.season_number > 0 || seasons.length === 1);
  if (!list.length) return null;
  const select = h(
    'select',
    { class: 'select', 'aria-label': 'Season' },
    list.map((s) => h('option', { value: s.season_number }, `${s.name}${s.episode_count ? ` (${s.episode_count} episodes)` : ''}`)),
  );
  const episodes = h('div', { class: 'episodes' });
  const load = () => {
    episodes.replaceChildren(...skeleton('line', 4));
    fill(
      episodes,
      () => api(`tmdb/tv/${tvId}/season/${select.value}`, { ttl: 3600 }),
      (s) =>
        (s.episodes || []).map((ep) =>
          h(
            'div',
            { class: 'episode' },
            h('div', { class: 'card-media' }, img(tmdbImg(ep.still_path, 'w300'), '')),
            h(
              'div',
              null,
              h('h4', null, `${ep.episode_number}. ${ep.name || 'Episode ' + ep.episode_number}`),
              h('div', { class: 'card-meta', style: { marginBottom: '4px' } }, [ep.air_date, ep.runtime ? `${ep.runtime} min` : null].filter(Boolean).join(' · ')),
              h('p', { class: 'clamp-3' }, ep.overview || ''),
            ),
          ),
        ),
    );
  };
  select.onchange = load;
  load();
  return h('section', { class: 'section' }, h('div', { class: 'row-head' }, h('h2', { class: 'section-title', style: { margin: 0 } }, 'Episodes'), select), episodes);
}

/** If the Internet Archive has a public-domain copy of this exact film, offer to play it here. */
async function findPublicDomainCopy(title, year, slot) {
  const norm = (s) =>
    String(s || '')
      .toLowerCase()
      .replace(/^the\s+/, '')
      .replace(/[^a-z0-9]+/g, '');
  try {
    const d = await api(`archive/search?q=${encodeURIComponent(title)}&rows=10`, { ttl: 86400 });
    const want = norm(title);
    const match = d.items.find((it) => norm(it.title) === want && (!year || !it.year || Math.abs(it.year - Number(year)) <= 1));
    if (!match) return;
    slot.replaceChildren(
      h(
        'div',
        { class: 'free-here' },
        h('div', null, h('strong', null, 'This film is in the public domain.'), h('div', { class: 'muted' }, 'Watch it free right here, from the Internet Archive.')),
        h('button', { class: 'btn btn-primary', onclick: () => playArchive(match) }, icon('play', 18), 'Watch free'),
      ),
    );
  } catch {
    /* optional feature */
  }
}
