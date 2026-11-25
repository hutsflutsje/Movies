// GET /api/youtube/trending?region=US&category=10
// Most popular videos for a region (costs 1 quota unit).
import { cachedJson, handleError, json, strParam } from '../../_lib/util.js';
import { YT_BASE, missingKey, toVideo } from '../../_lib/youtube.js';

export async function onRequestGet(ctx) {
  const { env, request } = ctx;
  const key = env.YOUTUBE_API_KEY;
  if (!key) return json(missingKey(), { status: 503 });

  const sp = new URL(request.url).searchParams;
  const region = (strParam(sp, 'region', 2) || env.DEFAULT_REGION || 'US').toUpperCase().replace(/[^A-Z]/g, '') || 'US';
  const category = strParam(sp, 'category', 3).replace(/\D/g, '');

  const params = new URLSearchParams({
    part: 'snippet,contentDetails,statistics',
    chart: 'mostPopular',
    regionCode: region,
    maxResults: '24',
  });
  if (category) params.set('videoCategoryId', category);

  try {
    const base = env.YOUTUBE_API_BASE || YT_BASE;
    const data = await cachedJson(ctx, `${base}/videos?${params}&key=${encodeURIComponent(key)}`, {
      ttl: 3 * 3600,
      cacheKey: `yt/trending?${params}`,
    });
    const items = (data.items || []).filter((it) => it?.id).map((it) => toVideo(it.id, it.snippet, it));
    return json({ items }, { maxAge: 1800 });
  } catch (err) {
    return handleError(err);
  }
}
