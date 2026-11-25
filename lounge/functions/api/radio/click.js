// POST /api/radio/click?id=<stationuuid>
// radio-browser.info asks apps to report plays so popular stations rank higher. Fire-and-forget.
import { json } from '../../_lib/util.js';
import { UA, mirrors } from '../../_lib/radio.js';

export async function onRequestPost(ctx) {
  const id = (new URL(ctx.request.url).searchParams.get('id') || '').replace(/[^a-f0-9-]/gi, '').slice(0, 40);
  if (id) {
    const host = mirrors(ctx.env)[0];
    ctx.waitUntil(fetch(`${host}/json/url/${id}`, { headers: UA }).catch(() => {}));
  }
  return json({ ok: true });
}
