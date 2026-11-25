// radio-browser.info: a free, community-run directory of ~50,000 internet radio stations.
import { cachedJson, httpsOrNull, shuffle, UpstreamError } from './util.js';

const MIRRORS = ['https://de1.api.radio-browser.info', 'https://nl1.api.radio-browser.info', 'https://at1.api.radio-browser.info'];

export function mirrors(env) {
  if (env.RADIO_API_BASE) return env.RADIO_API_BASE.split(',').map((h) => h.trim());
  return [...shuffle(MIRRORS), 'https://all.api.radio-browser.info'];
}

export const UA = { 'user-agent': 'LoungeMediaHub/1.0' };

export async function radioGet(ctx, path, params, { ttl = 1800, cacheKey } = {}) {
  const qs = new URLSearchParams(params);
  let lastErr = new UpstreamError(502, 'The radio directory is not reachable right now');
  for (const host of mirrors(ctx.env)) {
    try {
      return await cachedJson(ctx, `${host}${path}?${qs}`, { ttl, headers: UA, cacheKey: cacheKey && `radio${cacheKey}`, timeoutMs: 6000 });
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

/** Only keep HTTPS, non-HLS streams: HTTP streams are blocked on an HTTPS site, HLS needs extra libraries. */
export function toStation(s) {
  const stream = httpsOrNull(s.url_resolved) || httpsOrNull(s.url);
  if (!stream || s.hls === 1 || s.lastcheckok === 0) return null;
  return {
    id: s.stationuuid,
    name: (s.name || '').trim() || 'Unnamed station',
    stream,
    favicon: httpsOrNull(s.favicon),
    homepage: httpsOrNull(s.homepage),
    tags: String(s.tags || '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 4),
    country: s.country || '',
    countrycode: (s.countrycode || '').toUpperCase(),
    codec: s.codec || '',
    bitrate: Number(s.bitrate) || 0,
    votes: Number(s.votes) || 0,
  };
}
