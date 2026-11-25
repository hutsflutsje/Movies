// GET /api/archive/search?cat=popular|scifi|noir|comedy|western|tv|cartoons|silent&q=&page=&rows=
// Free, legal, public-domain films and TV from the Internet Archive (no API key needed).
import { cachedJson, fail, handleError, intParam, json, stripHtml, strParam } from '../../_lib/util.js';

const FILMS = 'collection:(feature_films)';

// Each category is a search query. Sub-collections are OR'ed with subject searches inside
// "feature_films" so a category still has results if a sub-collection is renamed.
const CATEGORIES = {
  popular: FILMS,
  scifi: `(collection:(SciFi_Horror OR scifi_horror) OR (${FILMS} AND subject:("science fiction" OR scifi OR "sci-fi" OR horror)))`,
  noir: `(collection:(Film_Noir OR film_noir) OR (${FILMS} AND subject:(noir OR "film noir")))`,
  comedy: `(collection:(Comedy_Films OR comedy_films) OR (${FILMS} AND subject:(comedy)))`,
  western: `(${FILMS} AND subject:(western OR westerns))`,
  tv: 'collection:(classic_tv)',
  cartoons: 'collection:(classic_cartoons)',
  silent: `(collection:(silent_films) OR (${FILMS} AND subject:(silent)))`,
};

const ALL = `(${Object.values(CATEGORIES).join(' OR ')})`;

/** Make user input safe to put inside a Lucene query. */
function toTerms(q) {
  return q
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .replace(/'/g, '')
    .split(/\s+/)
    .filter((w) => w && !['and', 'or', 'not', 'to'].includes(w))
    .slice(0, 8);
}

const asText = (v) => (Array.isArray(v) ? v.join(' ') : v == null ? '' : String(v));

export async function onRequestGet(ctx) {
  const sp = new URL(ctx.request.url).searchParams;
  const q = strParam(sp, 'q', 120);
  const cat = strParam(sp, 'cat', 20) || 'popular';
  const page = intParam(sp, 'page', 1, 1, 50);
  const rows = intParam(sp, 'rows', 24, 1, 50);

  let query;
  if (q) {
    const terms = toTerms(q);
    if (!terms.length) return json({ items: [], total: 0, page });
    query = `mediatype:(movies) AND ${ALL} AND title:(${terms.join(' AND ')})`;
  } else {
    if (!CATEGORIES[cat]) return fail('Unknown category', 400);
    query = `mediatype:(movies) AND ${CATEGORIES[cat]}`;
  }

  const upstream = new URL('/advancedsearch.php', ctx.env.ARCHIVE_API_BASE || 'https://archive.org');
  upstream.searchParams.set('q', query);
  for (const f of ['identifier', 'title', 'year', 'description', 'downloads', 'runtime']) {
    upstream.searchParams.append('fl[]', f);
  }
  upstream.searchParams.append('sort[]', 'downloads desc');
  upstream.searchParams.set('rows', String(rows));
  upstream.searchParams.set('page', String(page));
  upstream.searchParams.set('output', 'json');

  try {
    const data = await cachedJson(ctx, upstream.toString(), {
      ttl: 3600 * 12,
      cacheKey: `archive/${q ? 'q:' + q.toLowerCase() : 'cat:' + cat}/${page}/${rows}`,
    });
    const docs = data?.response?.docs || [];
    const items = docs
      .filter((d) => d && typeof d.identifier === 'string')
      .map((d) => {
        const id = d.identifier;
        const enc = encodeURIComponent(id);
        const year = parseInt(asText(d.year).slice(0, 4), 10);
        return {
          id,
          title: stripHtml(asText(d.title)) || id,
          year: Number.isFinite(year) ? year : null,
          description: stripHtml(asText(d.description)).slice(0, 600),
          runtime: stripHtml(asText(d.runtime)).slice(0, 20) || null,
          downloads: Number(d.downloads) || 0,
          thumb: `https://archive.org/services/img/${enc}`,
          embed: `https://archive.org/embed/${enc}`,
          url: `https://archive.org/details/${enc}`,
        };
      });
    return json({ items, total: data?.response?.numFound || 0, page }, { maxAge: 3600 });
  } catch (err) {
    return handleError(err);
  }
}
