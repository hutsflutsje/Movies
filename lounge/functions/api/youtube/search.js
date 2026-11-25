// GET /api/youtube/search?q=...&pageToken=...
// Uses the official YouTube Data API v3. search.list costs 100 quota units (10,000 free per day),
// so results are cached for 6 hours at the edge and 30 minutes in the browser.
import { cachedJson, fail, handleError, json, strParam } from '../../_lib/util.js';
import { YT_BASE, missingKey, toVideo } from '../../_lib/youtube.js';

export async function onRequestGet(ctx) {
  const { env, request } = ctx;
  const key = env.YOUTUBE_API_KEY;
  if (!key) return json(missingKey(), { status: 503 });

  const sp = new URL(request.url).searchParams;
  const q = strParam(sp, 'q', 150);
  const pageToken = strParam(sp, 'pageToken', 100).replace(/[^\w-]/g, '');
  if (!q) return fail('Type something to search for', 400);

  const base = env.YOUTUBE_API_BASE || YT_BASE;
  const safeSearch = ['none', 'moderate', 'strict'].includes(env.YOUTUBE_SAFESEARCH) ? env.YOUTUBE_SAFESEARCH : 'moderate';
  const params = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    videoEmbeddable: 'true',
    maxResults: '24',
    safeSearch,
    q,
  });
  if (pageToken) params.set('pageToken', pageToken);

  try {
    const search = await cachedJson(ctx, `${base}/search?${params}&key=${encodeURIComponent(key)}`, {
      ttl: 6 * 3600,
      cacheKey: `yt/search?${params}`,
    });
    const hits = (search.items || []).filter((it) => it?.id?.videoId);
    const ids = hits.map((it) => it.id.videoId);

    // One cheap extra call (1 unit) for durations and view counts.
    let details = {};
    if (ids.length) {
      try {
        const vparams = new URLSearchParams({ part: 'contentDetails,statistics', id: ids.join(',') });
        const v = await cachedJson(ctx, `${base}/videos?${vparams}&key=${encodeURIComponent(key)}`, {
          ttl: 6 * 3600,
          cacheKey: `yt/videos?${vparams}`,
        });
        details = Object.fromEntries((v.items || []).map((it) => [it.id, it]));
      } catch {
        /* durations are optional */
      }
    }

    return json(
      {
        items: hits.map((it) => toVideo(it.id.videoId, it.snippet, details[it.id.videoId])),
        nextPageToken: search.nextPageToken || null,
      },
      { maxAge: 1800 },
    );
  } catch (err) {
    return handleError(err);
  }
}
