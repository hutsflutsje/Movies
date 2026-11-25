// GET /api/music/trending?genre=Electronic&time=week|month|year|allTime
import { handleError, json, strParam } from '../../_lib/util.js';
import { GENRES, audiusGet, playable, toTrack } from '../../_lib/audius.js';

const TIMES = ['week', 'month', 'year', 'allTime'];

export async function onRequestGet(ctx) {
  const sp = new URL(ctx.request.url).searchParams;
  const genre = strParam(sp, 'genre', 40);
  const time = TIMES.includes(sp.get('time')) ? sp.get('time') : 'week';

  const params = { time, limit: '60' };
  if (genre && GENRES.includes(genre)) params.genre = genre;

  try {
    const { host, data } = await audiusGet(ctx, '/tracks/trending', params, {
      ttl: 1800,
      cacheKey: `/trending/${time}/${params.genre || 'all'}`,
    });
    const items = (data.data || []).filter(playable).map((t) => toTrack(t, host, ctx.env));
    return json({ items, genres: GENRES }, { maxAge: 900 });
  } catch (err) {
    return handleError(err);
  }
}
