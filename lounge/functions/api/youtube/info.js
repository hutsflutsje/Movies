// GET /api/youtube/info?id=VIDEO_ID
// Title + channel for a pasted link via YouTube's public oEmbed endpoint (no API key needed).
import { cachedJson, fail, json } from '../../_lib/util.js';

export async function onRequestGet(ctx) {
  const id = new URL(ctx.request.url).searchParams.get('id') || '';
  if (!/^[\w-]{11}$/.test(id)) return fail('Invalid video id', 400);
  const base = ctx.env.YOUTUBE_OEMBED_BASE || 'https://www.youtube.com';
  const target = `${base}/oembed?format=json&url=${encodeURIComponent('https://www.youtube.com/watch?v=' + id)}`;
  try {
    const d = await cachedJson(ctx, target, { ttl: 86400, cacheKey: `yt/info/${id}` });
    return json({ id, title: d.title || null, channel: d.author_name || null, thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` }, { maxAge: 86400 });
  } catch {
    // Private/removed videos fail oEmbed; the player itself will show YouTube's message.
    return json({ id, title: null, channel: null, thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` }, { maxAge: 600 });
  }
}
