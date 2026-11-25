// Shared helpers for the Pages Functions backend.
// Files/folders starting with "_" inside /functions are not turned into routes.

export class UpstreamError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function json(data, { status = 200, maxAge = 0, headers = {} } = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': maxAge > 0 ? `public, max-age=${maxAge}` : 'no-store',
      ...headers,
    },
  });
}

export function fail(message, status = 500, extra = {}) {
  return json({ error: message, ...extra }, { status });
}

/** Turn any thrown error into a JSON error response. */
export function handleError(err) {
  if (err instanceof UpstreamError) {
    const status = err.status === 429 ? 429 : 502;
    return fail(err.message || 'Upstream service error', status, { upstreamStatus: err.status });
  }
  return fail('Something went wrong talking to an upstream service.', 502);
}

/** Short message for an upstream HTTP error, without leaking keys. */
function upstreamMessage(status, bodyText) {
  try {
    const body = JSON.parse(bodyText);
    const msg = body?.error?.message || body?.status_message || body?.message || body?.error;
    if (typeof msg === 'string' && msg) return msg.slice(0, 300);
  } catch {
    /* not JSON */
  }
  return `Upstream service returned HTTP ${status}`;
}

/**
 * Fetch JSON from an upstream API, with best-effort edge caching through the Cache API.
 * `cacheKey` must NOT contain secrets; it is a path under the current origin.
 */
export async function cachedJson(ctx, url, { ttl = 600, headers = {}, cacheKey, timeoutMs = 9000 } = {}) {
  const cache = typeof caches !== 'undefined' && caches.default ? caches.default : null;
  const keyUrl = new URL(`/__cache/${cacheKey || ''}`, ctx.request.url).toString();
  const keyReq = new Request(keyUrl, { method: 'GET' });

  if (cache && cacheKey && ttl > 0) {
    try {
      const hit = await cache.match(keyReq);
      if (hit) return await hit.json();
    } catch {
      /* cache unavailable: ignore */
    }
  }

  const res = await fetch(url, {
    headers: { accept: 'application/json', ...headers },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  if (!res.ok) throw new UpstreamError(res.status, upstreamMessage(res.status, text));

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new UpstreamError(502, 'Upstream service returned invalid JSON');
  }

  if (cache && cacheKey && ttl > 0) {
    const toStore = new Response(JSON.stringify(data), {
      headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${ttl}` },
    });
    ctx.waitUntil(cache.put(keyReq, toStore).catch(() => {}));
  }
  return data;
}

/** Clamp an integer query parameter. */
export function intParam(searchParams, name, def, min, max) {
  const n = parseInt(searchParams.get(name) ?? '', 10);
  if (Number.isNaN(n)) return def;
  return Math.min(max, Math.max(min, n));
}

/** Trimmed, length-limited string parameter. */
export function strParam(searchParams, name, maxLen = 200) {
  return (searchParams.get(name) || '').trim().slice(0, maxLen);
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Decode the HTML entities YouTube/IA put in plain-text fields. */
export function decodeEntities(s = '') {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

/** Strip HTML tags and collapse whitespace (output is still escaped by the frontend). */
export function stripHtml(s = '') {
  return decodeEntities(String(s).replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Only allow https URLs through (avoids mixed-content and javascript: URLs). */
export function httpsOrNull(u) {
  if (typeof u !== 'string') return null;
  try {
    const url = new URL(u.trim());
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}
