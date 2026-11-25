// Global audio player (Audius tracks + radio) that keeps playing while you browse,
// plus a "theater" modal for embedded videos (trailers, public-domain films).
import { addHistory, fmtTime, h, icon, img, post, store, toast } from './lib.js';

const audio = new Audio();
audio.preload = 'none';
audio.volume = store.get('volume', 0.9);

let queue = [];
let index = -1;
let bar; // DOM refs
let refs = {};
let seeking = false;

export function current() {
  return queue[index] || null;
}

export function isPlaying() {
  return !audio.paused && !audio.ended;
}

function emit() {
  window.dispatchEvent(new CustomEvent('player:change', { detail: { current: current(), playing: isPlaying() } }));
}

/* ---------- Public controls ---------- */

export function playTracks(tracks, startIndex = 0) {
  queue = tracks.map((t) => ({ ...t, kind: 'track' }));
  index = startIndex;
  load();
}

export function playStation(station) {
  queue = [{ ...station, kind: 'station', title: station.name, artist: [station.country, ...(station.tags || []).slice(0, 2)].filter(Boolean).join(' · '), artwork: station.favicon }];
  index = 0;
  load();
  post(`radio/click?id=${encodeURIComponent(station.id)}`);
}

export function toggle() {
  if (!current()) return;
  if (audio.paused) audio.play().catch(playError);
  else audio.pause();
}

export function next() {
  if (index < queue.length - 1) {
    index++;
    load();
  } else {
    audio.pause();
  }
}

export function prev() {
  if (audio.currentTime > 4 || index === 0) {
    audio.currentTime = 0;
    return;
  }
  index--;
  load();
}

export function stop() {
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  queue = [];
  index = -1;
  render();
  emit();
}

/** Pause music when a video starts, so two things don't play at once. */
export function pauseForVideo() {
  if (isPlaying()) audio.pause();
}

function load() {
  const item = current();
  if (!item) return;
  audio.src = item.stream;
  audio.play().catch(playError);
  render();
  updateMediaSession(item);
  addHistory({
    kind: item.kind,
    id: item.id,
    title: item.title,
    subtitle: item.artist,
    thumb: item.artwork,
    data: item,
  });
  emit();
}

function playError() {
  // Autoplay blocks (NotAllowedError) and superseded loads (AbortError) need no message,
  // and real media failures are reported once by the audio 'error' event below.
}

let failures = 0; // consecutive tracks that failed to load

/* ---------- Audio events ---------- */

audio.addEventListener('play', () => {
  render();
  emit();
});
audio.addEventListener('pause', () => {
  render();
  emit();
});
audio.addEventListener('waiting', () => bar?.classList.add('loading'));
audio.addEventListener('playing', () => {
  bar?.classList.remove('loading');
  failures = 0;
});
audio.addEventListener('ended', () => next());
audio.addEventListener('error', () => {
  if (!audio.getAttribute('src')) return;
  bar?.classList.remove('loading');
  const item = current();
  failures++;
  if (item?.kind === 'station') {
    toast('This station is offline right now. Try another one.', 'error');
  } else if (failures >= 3) {
    // Several in a row: the music service is probably unreachable from this network.
    failures = 0;
    audio.pause();
    toast("Can't reach the music service right now. Try again later.", 'error');
  } else if (index < queue.length - 1) {
    if (failures === 1) toast("Couldn't load that track. Skipping…", 'error');
    next();
  } else {
    toast("Couldn't load that track.", 'error');
  }
});
audio.addEventListener('timeupdate', () => {
  if (!refs.seek || seeking) return;
  const live = current()?.kind === 'station' || !Number.isFinite(audio.duration);
  if (live) return;
  refs.seek.value = String(Math.floor((audio.currentTime / (audio.duration || 1)) * 1000));
  refs.elapsed.textContent = fmtTime(audio.currentTime);
  refs.total.textContent = fmtTime(audio.duration);
  bar.style.setProperty('--progress', `${(audio.currentTime / (audio.duration || 1)) * 100}%`);
});

/* ---------- Media Session (lock screen / keyboard media keys) ---------- */

function updateMediaSession(item) {
  if (!('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: item.title,
      artist: item.artist || '',
      artwork: item.artwork ? [{ src: item.artwork, sizes: '480x480' }] : [],
    });
    navigator.mediaSession.setActionHandler('play', () => audio.play());
    navigator.mediaSession.setActionHandler('pause', () => audio.pause());
    navigator.mediaSession.setActionHandler('nexttrack', queue.length > 1 ? next : null);
    navigator.mediaSession.setActionHandler('previoustrack', queue.length > 1 ? prev : null);
  } catch {
    /* unsupported action */
  }
}

/* ---------- Player bar UI ---------- */

export function mountPlayer(el) {
  bar = el;
  const playBtn = h('button', { class: 'pbtn pbtn-main', 'aria-label': 'Play/pause', onclick: toggle });
  const prevBtn = h('button', { class: 'pbtn', 'aria-label': 'Previous', onclick: prev }, icon('prev', 18));
  const nextBtn = h('button', { class: 'pbtn', 'aria-label': 'Next', onclick: next }, icon('next', 18));
  const seek = h('input', { class: 'seek', type: 'range', min: '0', max: '1000', value: '0', 'aria-label': 'Seek' });
  seek.addEventListener('input', () => {
    seeking = true;
  });
  seek.addEventListener('change', () => {
    if (Number.isFinite(audio.duration)) audio.currentTime = (Number(seek.value) / 1000) * audio.duration;
    seeking = false;
  });
  const vol = h('input', { class: 'vol', type: 'range', min: '0', max: '1', step: '0.01', value: String(audio.volume), 'aria-label': 'Volume' });
  vol.addEventListener('input', () => {
    audio.volume = Number(vol.value);
    audio.muted = false;
    store.set('volume', audio.volume);
    render();
  });
  const muteBtn = h('button', { class: 'pbtn', 'aria-label': 'Mute', onclick: () => ((audio.muted = !audio.muted), render()) });
  const closeBtn = h('button', { class: 'pbtn', 'aria-label': 'Close player', onclick: stop }, icon('close', 18));

  refs = {
    art: h('div', { class: 'p-art' }),
    title: h('div', { class: 'p-title' }),
    artist: h('div', { class: 'p-artist' }),
    link: h('a', { class: 'p-link', target: '_blank', rel: 'noopener', title: 'Open source page' }, icon('external', 14)),
    playBtn,
    prevBtn,
    nextBtn,
    seek,
    elapsed: h('span', { class: 'p-time' }, '0:00'),
    total: h('span', { class: 'p-time' }, '0:00'),
    live: h('span', { class: 'live-badge' }, 'LIVE'),
    muteBtn,
    vol,
  };

  el.append(
    h('div', { class: 'p-progress' }),
    h(
      'div',
      { class: 'p-inner' },
      h('div', { class: 'p-meta' }, refs.art, h('div', { class: 'p-text' }, refs.title, h('div', { class: 'p-sub' }, refs.artist, refs.link))),
      h(
        'div',
        { class: 'p-center' },
        h('div', { class: 'p-buttons' }, prevBtn, playBtn, nextBtn),
        h('div', { class: 'p-seek' }, refs.elapsed, seek, refs.total, refs.live),
      ),
      h('div', { class: 'p-right' }, muteBtn, vol, closeBtn),
    ),
  );
  render();
}

function render() {
  if (!bar) return;
  const item = current();
  bar.hidden = !item;
  document.body.classList.toggle('has-player', Boolean(item));
  if (!item) return;
  const live = item.kind === 'station';
  bar.classList.toggle('is-live', live);
  refs.art.replaceChildren(item.artwork ? img(item.artwork, '') : h('div', { class: 'img-fallback' }, icon(live ? 'radio' : 'music', 20)));
  refs.title.textContent = item.title;
  refs.artist.textContent = item.artist || '';
  refs.link.hidden = !(item.url || item.homepage);
  if (item.url || item.homepage) refs.link.href = item.url || item.homepage;
  refs.playBtn.replaceChildren(icon(isPlaying() ? 'pause' : 'play', 22));
  refs.prevBtn.disabled = live || queue.length < 2;
  refs.nextBtn.disabled = live || index >= queue.length - 1;
  refs.muteBtn.replaceChildren(icon(audio.muted || audio.volume === 0 ? 'mute' : 'volume', 18));
  if (live) bar.style.setProperty('--progress', '100%');
}

/* ---------- Keyboard: space = play/pause (when not typing) ---------- */

document.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || !current()) return;
  const t = e.target;
  if (t.closest('input, textarea, select, button, [contenteditable], iframe')) return;
  e.preventDefault();
  toggle();
});

/* ---------- Theater modal for embedded video ---------- */

let openModal = null;

export function closeTheater() {
  if (openModal) openModal();
}

/**
 * openTheater({ title, subtitle, embed, link, linkLabel, extra })
 * `embed` is an https iframe URL (YouTube no-cookie, archive.org, ...)
 */
export function openTheater({ title, subtitle, embed, link, linkLabel = 'Open source', extra }) {
  closeTheater();
  pauseForVideo();
  const root = document.getElementById('modal-root');
  const frame = h('iframe', {
    src: embed,
    title: title || 'Video player',
    allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen',
    allowfullscreen: true,
    referrerpolicy: 'strict-origin-when-cross-origin',
  });
  const close = () => {
    overlay.remove();
    document.body.classList.remove('modal-open');
    document.removeEventListener('keydown', onKey);
    openModal = null;
  };
  const onKey = (e) => e.key === 'Escape' && close();
  const overlay = h(
    'div',
    { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title || 'Video' },
    h(
      'div',
      { class: 'modal-box' },
      h('div', { class: 'modal-top' }, h('div', { class: 'modal-title' }, title), h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: close }, icon('close'))),
      h('div', { class: 'theater' }, frame),
      h(
        'div',
        { class: 'modal-foot' },
        subtitle && h('p', { class: 'muted clamp-3' }, subtitle),
        h('div', { class: 'modal-actions' }, extra, link && h('a', { class: 'btn btn-ghost btn-sm', href: link, target: '_blank', rel: 'noopener' }, icon('external', 16), linkLabel)),
      ),
    ),
  );
  overlay.addEventListener('click', (e) => e.target === overlay && close());
  document.addEventListener('keydown', onKey);
  document.body.classList.add('modal-open');
  root.append(overlay);
  openModal = close;
  return close;
}
