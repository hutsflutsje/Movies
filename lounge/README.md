# Lounge

A personal media hub that runs on **Cloudflare Pages** (free plan). It has:

| Section | What it does | Needs a key? |
|---|---|---|
| **Movies & TV** | Public-domain classics (Internet Archive) that play right on the site. Search any movie/show (TMDB) to see details, trailers, cast, episodes and **where it streams legally in your country, including free ad-supported services** (Tubi, Pluto TV, Plex, Roku Channel…). If a title is in the public domain, a "Watch free" button plays it on the site. | Classics: no. Search and where-to-watch: free TMDB key |
| **YouTube** | Search, popular videos by category, paste-any-link, and a clean watch page with an "Up next" list. Plays in YouTube's official privacy-enhanced player. | Search: free YouTube Data API key. Pasting links works without one |
| **Music** | Full-length songs from independent artists on Audius (search, trending by genre), about 50,000 live radio stations, and a "Spotify shelf" that plays Spotify links in Spotify's official player. One music player keeps playing while you browse. | No |
| **Games** | Three original browser games: **Neon Coil** (arena snake with AI rivals), **Flip Rider** (stunt motocross, 8 tracks) and **Rumble Truck** (monster-truck obstacle courses, 8 levels). They are hosted on your site, with keyboard, mouse and touch controls. | No |

Extras: "Jump back in" history, My List, saved radio stations, an optional site password, a mobile layout with a bottom tab bar, and keyboard shortcuts (Space = play/pause).

> **What's not included:** this project only uses sources that are free and legal to use. It has no piracy stream embeds, no proxies that strip ads out of YouTube or Spotify, and no copied commercial games. The YouTube and Spotify players are their official embeds, so the owners of those players decide whether ads appear.

---

## 1. Project layout

```
lounge/
├── public/                  ← the website (Cloudflare Pages serves this folder)
│   ├── index.html
│   ├── css/app.css
│   ├── js/                  ← app.js (router), lib.js, player.js, cards.js, pages/*.js
│   ├── games/
│   │   ├── games.json       ← the games catalog (add games here)
│   │   ├── neon-coil/
│   │   ├── flip-rider/
│   │   ├── rumble-truck/
│   │   └── shared/          ← physics engine, game UI, planck.js (Box2D)
│   └── img/, manifest.webmanifest
├── functions/               ← the backend (Cloudflare Pages Functions)
│   ├── _middleware.js       ← optional password + security headers
│   ├── _lib/                ← shared helpers
│   └── api/
│       ├── config.js        → GET /api/config
│       ├── tmdb/[[path]].js → GET /api/tmdb/...           (movies & TV)
│       ├── archive/search.js→ GET /api/archive/search     (public-domain films)
│       ├── youtube/         → GET /api/youtube/search | trending | info
│       ├── music/           → GET /api/music/search | trending   (Audius)
│       └── radio/           → GET /api/radio/search, POST /api/radio/click
├── wrangler.toml            ← Pages config (output folder = public)
├── .dev.vars.example        ← template for local secrets
└── package.json
```

The backend's only job is to keep API keys secret and to cache results. The browser never sees your keys, and each proxy only allows the few read-only endpoints the site uses.

---

## 2. Get your free API keys (optional, about 10 minutes)

The site works without any keys (classic movies, music, radio, games and pasting YouTube links). The keys unlock search.

### TMDB (Movies & TV search + where to watch)
1. Create a free account at <https://www.themoviedb.org/signup>.
2. Go to **Settings → API**, click **Create**, choose **Developer**, and fill in the short form. A personal or educational project is fine.
3. Copy either the **API Key** (short) or the **API Read Access Token** (long, starts with `eyJ`). Both work.

### YouTube Data API v3 (YouTube search + popular)
1. Go to <https://console.cloud.google.com/>, create a project (any name).
2. **APIs & Services → Library**, search **YouTube Data API v3**, then click **Enable**.
3. **APIs & Services → Credentials → Create credentials → API key**. Copy it.
4. Recommended: edit the key and under **API restrictions** choose **Restrict key → YouTube Data API v3**. Don't add website (referrer) restrictions: the calls come from Cloudflare's servers, not the browser.

The free quota is 10,000 units per day. A search costs 100 units (about 100 searches a day) and "Popular" costs 1. Results are cached for 6 hours on Cloudflare and 30 minutes in your browser, so repeat searches are free.

---

## 3. Run it on your computer (optional)

You need [Node.js](https://nodejs.org/) 18 or newer.

```bash
npm install
cp .dev.vars.example .dev.vars     # then paste your keys into .dev.vars
npm run dev                         # opens http://localhost:8788
```

`npm run dev` runs the real backend locally (`wrangler pages dev`), so everything works exactly as it will on Cloudflare.

---

## 4. Deploy to Cloudflare Pages

Create a free account at <https://dash.cloudflare.com/sign-up> if you don't have one. Then pick **one** of these:

### Option A: GitHub + Cloudflare dashboard (recommended: auto-deploys on every push)

1. Create a new repository on GitHub and upload this folder: everything except `node_modules/` and `.dev.vars` (the included `.gitignore` already skips them).
2. In the Cloudflare dashboard, open **Workers & Pages** and click **Create**.
3. Choose **Pages**. If you only see Workers options, click the "Looking to deploy Pages? Get started" link. Then choose **Import an existing Git repository** / **Connect to Git**, authorize GitHub, and pick your repository.
4. Build settings:
   - **Framework preset:** `None`
   - **Build command:** leave empty (if the form insists on one, type `exit 0`)
   - **Build output directory:** `public`
   - **Root directory:** leave as `/`
5. Click **Save and Deploy**. After about a minute you get a URL like `https://lounge-xyz.pages.dev`.
6. Add your keys (next section), then redeploy once.

Cloudflare detects the `functions/` folder automatically. You don't need to configure the backend separately.

### Option B: Upload from your computer with Wrangler

```bash
npm install
npx wrangler login                                          # opens the browser to log in
npx wrangler pages project create lounge --production-branch main
npx wrangler pages deploy                                   # uploads public/ + functions/
```

Run `npx wrangler pages deploy` (or `npm run deploy`) again whenever you change something.

---

## 5. Add your API keys to Cloudflare

Keys are stored as encrypted **secrets**, never in the code.

**Dashboard:** your Pages project → **Settings → Variables and Secrets** (called "Environment variables" in older dashboards) → **Add** → Type **Secret**:

| Name | Value |
|---|---|
| `TMDB_API_KEY` | your TMDB key or read-access token |
| `YOUTUBE_API_KEY` | your YouTube Data API key |

Add them for **Production** (and Preview if you use preview branches). Secrets only apply to new deployments, so redeploy: **Deployments** → the latest one → **⋯ → Retry deployment**, or push a new commit.

**Command line instead:**

```bash
npx wrangler pages secret put TMDB_API_KEY --project-name lounge
npx wrangler pages secret put YOUTUBE_API_KEY --project-name lounge
npx wrangler pages deploy
```

To check it worked, open `https://your-site.pages.dev/api/config`. It should show `"tmdb":true,"youtube":true`. It never shows the keys themselves.

### Optional settings

| Name | What it does |
|---|---|
| `SITE_PASSWORD` | Locks the whole site behind a password prompt (any username works). Good for keeping your API quota to yourself. For proper logins, put the site behind **Cloudflare Access** (Zero Trust, free for small teams) instead. |
| `DEFAULT_REGION` | Two-letter country code (e.g. `NL`, `US`, `GB`) for "where to watch" and YouTube Popular. Each visitor can still change it on the page. |
| `SITE_NAME` | Changes the name shown in the header and tab title (default "Lounge"). |
| `YOUTUBE_SAFESEARCH` | `moderate` (default), `strict` or `none`. |
| `AUDIUS_APP_NAME` | The app name sent to Audius (default `lounge-media-hub`). |

### Custom domain (optional)
Pages project → **Custom domains** → **Set up a custom domain**, then follow the steps. If your domain already uses Cloudflare DNS, it's one click.

---

## 6. Adding more games

Open `public/games/games.json` and add an entry:

```json
{
  "id": "my-game",
  "title": "My Game",
  "description": "One line about it.",
  "cover": "/games/my-game/cover.png",
  "src": "/games/my-game/",
  "tags": ["Puzzle"],
  "controls": "Arrow keys to move."
}
```

- **Your own HTML5 game:** put its files in `public/games/my-game/` (with an `index.html`) and use `"src": "/games/my-game/"`.
- **A game from a distributor that allows embedding** (for example GameDistribution or GameMonetize, which hand out embed links for exactly this): add `"type": "embed"` and use the embed URL they give you as `src`. It opens inside the site in a sandboxed frame.
- **A link to a game's official site:** add `"type": "link"` and the URL as `src`; it opens in a new tab.

Please don't copy other people's games into the folder. Rehosted commercial games are what get sites taken down.

**Editing the built-in games:** levels for Flip Rider and Rumble Truck are plain lists in `public/games/flip-rider/levels.js` and `public/games/rumble-truck/levels.js`, written with a small "track builder" (`flat`, `hills`, `kicker`, `gap`, `bridge`, `seesaw`, `crateWall`, `boost`, `spikes`, `checkpoint`… see `public/games/shared/physics.js`). Vehicle handling (torque, speed, suspension, air-spin) is in the same files.

---

## 7. Customizing the look

- Colors and spacing are CSS variables at the top of `public/css/app.css` (`--accent`, `--bg`, …).
- The logo is `public/img/logo.svg`.
- The home page rows are built in `public/js/pages/home.js`.

---

## 8. Troubleshooting

| Problem | Fix |
|---|---|
| Movies page says "Add a free TMDB key" | The secret isn't set, or you didn't redeploy after adding it. Check `/api/config`. |
| `Invalid API key` from TMDB | Copy the key again. The long token must start with `eyJ`, with no spaces. |
| YouTube says quota exceeded | You've used the 10,000 daily units. It resets at midnight Pacific time. Pasting links still works. |
| A YouTube video shows "Video unavailable" | The uploader blocked embedding. Use "Open on YouTube". |
| Songs or a radio station won't play | Some networks (school or work) block streaming hosts, and some radio stations go offline. Try another station. |
| Changes don't show up | Hard-refresh (Ctrl/Cmd + Shift + R). With Git deploys, check the build log under **Deployments**. |
| Added Cloudflare Web Analytics and it doesn't load | Allow its hosts in the Content-Security-Policy in `functions/_middleware.js` (see the comment there). |

**Free-plan limits:** static files are unlimited. Pages Functions (the `/api` backend and the password check) get 100,000 requests per day on the free plan, which is plenty for personal use.

---

## 9. Credits & data sources

- Movie & TV data: [TMDB](https://www.themoviedb.org/). This product uses the TMDB API but is not endorsed or certified by TMDB. Streaming availability by [JustWatch](https://www.justwatch.com/).
- Public-domain films: [Internet Archive](https://archive.org/).
- Music: [Audius](https://audius.co/) artists (tap ↗ in the player to visit and support them).
- Radio directory: [radio-browser.info](https://www.radio-browser.info/).
- Videos: YouTube's official embedded player (`youtube-nocookie.com`).
- Physics: [planck.js](https://github.com/piqnt/planck.js) v1.4.2 (MIT, see `public/games/shared/planck-LICENSE.txt`).
