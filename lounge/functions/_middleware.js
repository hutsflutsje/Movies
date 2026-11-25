// Runs in front of every request (pages, assets and /api).
// 1) Optional password lock: set a SITE_PASSWORD secret to require a login.
// 2) Security headers. The Content-Security-Policy only lets the page run its own scripts.
//    If you turn on Cloudflare Web Analytics, add https://static.cloudflareinsights.com to
//    script-src and https://cloudflareinsights.com to connect-src below.

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https: data: blob:",
  "media-src 'self' https: blob:",
  "connect-src 'self'",
  "frame-src 'self' https:",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

function safeEqual(a, b) {
  // Constant-time-ish comparison so the password can't be guessed by timing.
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

function passwordOk(request, password) {
  const header = request.headers.get('authorization') || '';
  if (!header.startsWith('Basic ')) return false;
  try {
    const decoded = atob(header.slice(6));
    const pass = decoded.slice(decoded.indexOf(':') + 1);
    return safeEqual(pass, password);
  } catch {
    return false;
  }
}

export async function onRequest(context) {
  const { request, env, next } = context;

  if (env.SITE_PASSWORD && !passwordOk(request, env.SITE_PASSWORD)) {
    return new Response('Password required. Use any username and the site password.', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="Lounge", charset="UTF-8"',
        'cache-control': 'no-store',
        'content-type': 'text/plain; charset=utf-8',
      },
    });
  }

  const response = await next();
  const out = new Response(response.body, response);
  out.headers.set('Content-Security-Policy', CSP);
  out.headers.set('X-Content-Type-Options', 'nosniff');
  out.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  out.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  return out;
}
