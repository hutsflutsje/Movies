import { decodeEntities } from './util.js';

export const YT_BASE = 'https://www.googleapis.com/youtube/v3';

export function missingKey() {
  return {
    error: 'YouTube search needs a free YouTube Data API key (YOUTUBE_API_KEY). You can still paste YouTube links.',
    setup: 'youtube',
  };
}

/** ISO-8601 duration (PT1H2M3S) -> seconds */
export function parseDuration(iso = '') {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!m) return 0;
  const [, d = 0, h = 0, min = 0, s = 0] = m;
  return +d * 86400 + +h * 3600 + +min * 60 + +s;
}

function bestThumb(thumbs = {}) {
  return (thumbs.high || thumbs.medium || thumbs.standard || thumbs.default || {}).url || null;
}

/** Normalise a YouTube video resource (from search or videos endpoints) */
export function toVideo(id, snippet = {}, details) {
  return {
    id,
    title: decodeEntities(snippet.title || ''),
    channel: decodeEntities(snippet.channelTitle || ''),
    channelId: snippet.channelId || null,
    published: snippet.publishedAt || null,
    thumb: bestThumb(snippet.thumbnails) || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    live: snippet.liveBroadcastContent === 'live',
    duration: details?.contentDetails ? parseDuration(details.contentDetails.duration) : null,
    views: details?.statistics?.viewCount != null ? Number(details.statistics.viewCount) : null,
  };
}
