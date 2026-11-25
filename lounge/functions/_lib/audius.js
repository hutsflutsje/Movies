// Audius: a free music platform where artists upload full tracks for anyone to stream.
// Read endpoints work without an API key; Audius asks apps to send an app_name.
import { cachedJson, httpsOrNull, UpstreamError } from './util.js';

const DEFAULT_HOSTS = ['https://api.audius.co', 'https://discoveryprovider.audius.co'];

export const GENRES = [
  'Electronic', 'Hip-Hop/Rap', 'Lo-Fi', 'Pop', 'Rock', 'R&B/Soul', 'Alternative', 'Ambient', 'House',
  'Techno', 'Trap', 'Drum & Bass', 'Dubstep', 'Jazz', 'Classical', 'Acoustic', 'Latin', 'Reggae',
  'Metal', 'Country', 'Funk', 'Soundtrack', 'Experimental', 'World', 'Folk',
];

function hosts(env) {
  return env.AUDIUS_API_BASE ? env.AUDIUS_API_BASE.split(',').map((h) => h.trim()) : DEFAULT_HOSTS;
}

export function appName(env) {
  return (env.AUDIUS_APP_NAME || 'lounge-media-hub').replace(/[^\w.-]/g, '').slice(0, 50) || 'lounge-media-hub';
}

/** GET a v1 path from the first Audius host that answers. Returns { host, data }. */
export async function audiusGet(ctx, path, params, { ttl = 600, cacheKey } = {}) {
  const { env } = ctx;
  const qs = new URLSearchParams(params);
  qs.set('app_name', appName(env));
  const headers = env.AUDIUS_API_KEY ? { 'x-api-key': env.AUDIUS_API_KEY } : {};
  let lastErr = new UpstreamError(502, 'Audius is not reachable right now');
  for (const host of hosts(env)) {
    try {
      const data = await cachedJson(ctx, `${host}/v1${path}?${qs}`, { ttl, headers, cacheKey: cacheKey && `audius${cacheKey}` });
      return { host, data };
    } catch (err) {
      lastErr = err;
      if (err instanceof UpstreamError && err.status === 400) break; // our request is wrong; don't retry
    }
  }
  throw lastErr;
}

export function toTrack(t, host, env) {
  const art = t.artwork || {};
  const id = String(t.id);
  return {
    id,
    title: t.title || 'Untitled',
    artist: t.user?.name || t.user?.handle || 'Unknown artist',
    artwork: httpsOrNull(art['480x480'] || art['150x150'] || art['1000x1000']),
    duration: Number(t.duration) || 0,
    genre: t.genre || '',
    plays: Number(t.play_count) || 0,
    url: t.permalink ? `https://audius.co${t.permalink}` : null,
    // The stream endpoint answers with a redirect to the audio file, so <audio src> can use it directly.
    stream: `${host}/v1/tracks/${encodeURIComponent(id)}/stream?app_name=${appName(env)}`,
  };
}

/** Drop tracks that can't be streamed for free (deleted, unlisted, pay/follow-gated). */
export function playable(t) {
  return t && t.id && t.is_streamable !== false && !t.is_stream_gated && !t.is_delete && !t.is_unlisted;
}
