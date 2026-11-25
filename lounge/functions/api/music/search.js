// GET /api/music/search?q=lofi
import { fail, handleError, json, strParam } from '../../_lib/util.js';
import { audiusGet, playable, toTrack } from '../../_lib/audius.js';

export async function onRequestGet(ctx) {
  const q = strParam(new URL(ctx.request.url).searchParams, 'q', 100);
  if (!q) return fail('Type something to search for', 400);

  try {
    const { host, data } = await audiusGet(ctx, '/tracks/search', { query: q, limit: '50' }, {
      ttl: 1800,
      cacheKey: `/search/${encodeURIComponent(q.toLowerCase())}`,
    });
    const items = (data.data || []).filter(playable).map((t) => toTrack(t, host, ctx.env));
    return json({ items }, { maxAge: 900 });
  } catch (err) {
    return handleError(err);
  }
}
