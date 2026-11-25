// GET /api/radio/search?q=&tag=&country=NL&order=clickcount|votes|random
import { handleError, intParam, json, strParam } from '../../_lib/util.js';
import { radioGet, toStation } from '../../_lib/radio.js';

const ORDERS = ['clickcount', 'votes', 'random', 'clicktrend'];

export async function onRequestGet(ctx) {
  const sp = new URL(ctx.request.url).searchParams;
  const q = strParam(sp, 'q', 80);
  const tag = strParam(sp, 'tag', 40).toLowerCase();
  const country = strParam(sp, 'country', 2).toUpperCase().replace(/[^A-Z]/g, '');
  const order = ORDERS.includes(sp.get('order')) ? sp.get('order') : 'clickcount';
  const offset = intParam(sp, 'offset', 0, 0, 2000);

  const params = {
    hidebroken: 'true',
    is_https: 'true',
    order,
    reverse: order === 'random' ? 'false' : 'true',
    limit: '80',
    offset: String(offset),
  };
  if (q) params.name = q;
  if (tag) params.tag = tag;
  if (country) params.countrycode = country;

  try {
    const data = await radioGet(ctx, '/json/stations/search', params, {
      ttl: order === 'random' ? 0 : 3600,
      cacheKey: `/search?${new URLSearchParams(params)}`,
    });
    const seen = new Set();
    const items = [];
    for (const raw of Array.isArray(data) ? data : []) {
      const s = toStation(raw);
      if (!s) continue;
      const dedupe = s.name.toLowerCase() + '|' + s.stream;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      items.push(s);
    }
    return json({ items: items.slice(0, 60) }, { maxAge: order === 'random' ? 0 : 600 });
  } catch (err) {
    return handleError(err);
  }
}
