// GET /api/tmdb/<tmdb path>?<params>
// Thin, locked-down proxy to The Movie Database (TMDB) API so the API key stays on the server.
// Only the read-only endpoints the site uses are allowed.
import { cachedJson, fail, handleError, json } from '../../_lib/util.js';

const ROUTES = [
  { re: /^trending\/(all|movie|tv)\/(day|week)$/, ttl: 3600 },
  { re: /^search\/(multi|movie|tv)$/, ttl: 3600 },
  { re: /^discover\/(movie|tv)$/, ttl: 3600 * 3 },
  { re: /^(movie|tv)\/(popular|top_rated|now_playing|upcoming|airing_today|on_the_air)$/, ttl: 3600 * 3 },
  { re: /^(movie|tv)\/\d+$/, ttl: 3600 * 6 },
  { re: /^(movie|tv)\/\d+\/(recommendations|similar|videos|credits|watch\/providers)$/, ttl: 3600 * 6 },
  { re: /^tv\/\d+\/season\/\d+$/, ttl: 3600 * 6 },
  { re: /^genre\/(movie|tv)\/list$/, ttl: 86400 },
];

const ALLOWED_PARAMS = new Set([
  'query',
  'page',
  'language',
  'region',
  'year',
  'primary_release_year',
  'first_air_date_year',
  'append_to_response',
  'sort_by',
  'with_genres',
  'without_genres',
  'watch_region',
  'with_watch_monetization_types',
  'with_watch_providers',
  'with_original_language',
  'vote_count.gte',
  'vote_average.gte',
]);

const ALLOWED_APPEND = new Set(['videos', 'credits', 'recommendations', 'similar', 'watch/providers', 'content_ratings', 'release_dates']);

export async function onRequestGet(ctx) {
  const { request, env, params } = ctx;
  const key = env.TMDB_API_KEY;
  if (!key) return fail('Movie & TV search needs a free TMDB API key (TMDB_API_KEY).', 503, { setup: 'tmdb' });

  const path = (Array.isArray(params.path) ? params.path : [params.path]).filter(Boolean).join('/');
  const route = ROUTES.find((r) => r.re.test(path));
  if (!route) return fail('Not allowed', 404);

  const incoming = new URL(request.url).searchParams;
  const query = new URLSearchParams();
  for (const [k, v] of incoming) {
    if (!ALLOWED_PARAMS.has(k)) continue;
    let value = v.slice(0, 200);
    if (k === 'append_to_response') {
      value = value
        .split(',')
        .filter((p) => ALLOWED_APPEND.has(p))
        .join(',');
      if (!value) continue;
    }
    query.set(k, value);
  }
  query.set('include_adult', 'false');
  query.sort();

  const base = env.TMDB_API_BASE || 'https://api.themoviedb.org/3';
  const headers = {};
  const upstream = new URL(`${base}/${path}`);
  query.forEach((v, k) => upstream.searchParams.set(k, v));
  // TMDB accepts either the short "API Key" (v3) or the long "API Read Access Token" (starts with eyJ).
  if (key.startsWith('eyJ')) headers.authorization = `Bearer ${key}`;
  else upstream.searchParams.set('api_key', key);

  try {
    const data = await cachedJson(ctx, upstream.toString(), {
      ttl: route.ttl,
      headers,
      cacheKey: `tmdb/${path}?${query}`,
    });
    return json(data, { maxAge: Math.min(route.ttl, 3600) });
  } catch (err) {
    return handleError(err);
  }
}
