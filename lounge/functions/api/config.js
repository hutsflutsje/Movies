// GET /api/config -> which optional features are switched on (never returns the keys).
import { json } from '../_lib/util.js';

export function onRequestGet({ env }) {
  return json({
    tmdb: Boolean(env.TMDB_API_KEY),
    youtube: Boolean(env.YOUTUBE_API_KEY),
    region: (env.DEFAULT_REGION || '').toUpperCase().slice(0, 2) || null,
    siteName: env.SITE_NAME || null,
  });
}
