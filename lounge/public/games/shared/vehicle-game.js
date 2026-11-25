// Shared game shell for the physics driving games (rendering, input, menus, sound, progress).
import {
  buildLevel, createVehicle, destroyVehicle, driveVehicle, groundY, headHit, slopeAt, sweepBroken,
  touchingSpikes, updateLevel,
} from './physics.js';

const STEP = 1 / 60;
const SVG = {
  menu: '<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>',
  restart: '<svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>',
  sound: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/></svg>',
  mute: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="m17 9 5 6M22 9l-5 6"/></svg>',
  gas: '<svg viewBox="0 0 24 24"><path d="M8 5l9 7-9 7z" fill="currentColor"/></svg>',
  brake: '<svg viewBox="0 0 24 24"><path d="M16 5l-9 7 9 7z" fill="currentColor"/></svg>',
};

const fmt = (t) => {
  const m = Math.floor(t / 60);
  const s = (t % 60).toFixed(1).padStart(4, '0');
  return m ? `${m}:${s}` : `${(t % 60).toFixed(1)}`;
};

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

function load(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage blocked */
  }
}

/* ========================================================================== */
/* Sound: tiny WebAudio synth (engine hum + effects), no audio files needed     */
/* ========================================================================== */

function createSound(storageKey) {
  let ctx = null;
  let engine = null;
  let muted = load(storageKey, false);

  function ensure() {
    if (ctx || muted) return;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o1 = ctx.createOscillator();
      const o2 = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      o1.type = 'sawtooth';
      o2.type = 'square';
      o2.detune.value = -1200;
      filter.type = 'lowpass';
      filter.frequency.value = 700;
      gain.gain.value = 0;
      o1.connect(filter);
      o2.connect(filter);
      filter.connect(gain).connect(ctx.destination);
      o1.start();
      o2.start();
      engine = { o1, o2, filter, gain };
    } catch {
      ctx = null;
    }
  }

  function tone(freq, dur, type = 'square', vol = 0.08, slide = 0) {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function noise(dur, vol = 0.2, freq = 900) {
    if (!ctx || muted) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    f.type = 'lowpass';
    f.frequency.value = freq;
    g.gain.value = vol;
    src.buffer = buf;
    src.connect(f).connect(g).connect(ctx.destination);
    src.start();
  }

  return {
    unlock() {
      ensure();
      if (ctx?.state === 'suspended') ctx.resume();
    },
    get muted() {
      return muted;
    },
    toggle() {
      muted = !muted;
      save(storageKey, muted);
      if (muted && engine) engine.gain.gain.value = 0;
      if (!muted) ensure();
      return muted;
    },
    engine(rpm, throttle, on) {
      if (!engine || muted) return;
      const t = ctx.currentTime;
      const f = 38 + rpm * 2.4 + throttle * 18;
      engine.o1.frequency.setTargetAtTime(f, t, 0.05);
      engine.o2.frequency.setTargetAtTime(f, t, 0.05);
      engine.filter.frequency.setTargetAtTime(400 + throttle * 900 + rpm * 8, t, 0.08);
      engine.gain.gain.setTargetAtTime(on ? 0.035 + throttle * 0.035 : 0, t, 0.08);
    },
    crash: () => noise(0.45, 0.35, 600),
    smash: () => noise(0.12, 0.18, 2200),
    flip: () => {
      tone(520, 0.12, 'square', 0.06, 1.5);
      setTimeout(() => tone(780, 0.16, 'square', 0.06, 1.4), 90);
    },
    checkpoint: () => tone(880, 0.25, 'triangle', 0.1),
    finish: () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.22, 'triangle', 0.1), i * 110)),
  };
}

/* ========================================================================== */
/* Game                                                                        */
/* ========================================================================== */

export function startGame({ id, title, tagline, VEHICLE, THEME, LEVELS }) {
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  const ui = document.getElementById('ui');
  const sound = createSound(`${id}:muted`);
  const progressKey = `${id}:progress`;
  let progress = load(progressKey, { unlocked: 1, best: {}, stars: {} });

  let W = 0;
  let H = 0;
  let dpr = 1;
  const cam = { x: 0, y: 0, s: 40 };

  let screen = 'menu'; // menu | play | pause | crashed | finish
  let levelIndex = 0;
  let level = null;
  let v = null;
  let time = 0;
  let started = false;
  let bonus = 0;
  let flips = 0;
  let cpIndex = 0;
  let respawnAt = 0;
  let airRot = 0;
  let lastAngle = 0;
  let wasAir = false;
  let acc = 0;
  let particles = [];
  let menuLevel = null; // level shown behind the menu
  let menuT = 0;

  const input = { gas: false, brake: false };
  const keys = new Set();

  /* ---------- UI ---------- */

  const hud = el('div', 'hud');
  hud.innerHTML = `
    <div class="hud-left"><button class="hbtn" data-act="levels" aria-label="Levels">${SVG.menu}</button><div class="lvl-name"></div></div>
    <div class="hud-center"><div class="timer">0.0</div><div class="timer-sub"></div></div>
    <div class="hud-right">
      <button class="hbtn" data-act="sound" aria-label="Sound">${sound.muted ? SVG.mute : SVG.sound}</button>
      <button class="hbtn" data-act="restart" aria-label="Restart">${SVG.restart}</button>
      <button class="hbtn" data-act="pause" aria-label="Pause">${SVG.pause}</button>
    </div>
    <div class="progress"><div class="progress-bar"></div><div class="progress-cps"></div></div>`;
  const pedals = el('div', 'pedals');
  pedals.innerHTML = `<button class="pedal brake" aria-label="Brake">${SVG.brake}<span>BRAKE</span></button><button class="pedal gas" aria-label="Gas">${SVG.gas}<span>GAS</span></button>`;
  const popup = el('div', 'popup');
  const flash = el('div', 'flash');
  const hint = el('div', 'start-hint');
  const overlay = el('div', 'overlay');
  ui.append(hud, pedals, popup, flash, hint, overlay);

  const $ = (sel) => ui.querySelector(sel);

  hud.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    sound.unlock();
    if (act === 'pause') pause();
    if (act === 'restart') startLevel(levelIndex);
    if (act === 'levels') showMenu();
    if (act === 'sound') btn.innerHTML = sound.toggle() ? SVG.mute : SVG.sound;
    btn.blur();
  });

  function bindPedal(btn, key) {
    const on = (e) => {
      e.preventDefault();
      sound.unlock();
      btn.setPointerCapture?.(e.pointerId);
      input[key] = true;
      btn.classList.add('down');
    };
    const off = () => {
      input[key] = false;
      btn.classList.remove('down');
    };
    btn.addEventListener('pointerdown', on);
    btn.addEventListener('pointerup', off);
    btn.addEventListener('pointercancel', off);
    btn.addEventListener('lostpointercapture', off);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  bindPedal($('.pedal.gas'), 'gas');
  bindPedal($('.pedal.brake'), 'brake');

  const GAS = ['ArrowRight', 'KeyD', 'ArrowUp', 'KeyW'];
  const BRAKE = ['ArrowLeft', 'KeyA', 'ArrowDown', 'KeyS'];
  addEventListener('keydown', (e) => {
    if ([...GAS, ...BRAKE, 'Space'].includes(e.code)) e.preventDefault();
    sound.unlock();
    keys.add(e.code);
    if (e.repeat) return;
    if (e.code === 'KeyR' && level) startLevel(levelIndex);
    if (e.code === 'Escape' || e.code === 'KeyP') screen === 'pause' ? resume() : screen === 'play' || screen === 'crashed' ? pause() : null;
    if ((e.code === 'Enter' || e.code === 'Space') && screen === 'finish') {
      levelIndex + 1 < LEVELS.length ? startLevel(levelIndex + 1) : showMenu();
    }
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => {
    keys.clear();
    input.gas = input.brake = false;
    if (screen === 'play') pause();
  });
  document.addEventListener('visibilitychange', () => document.hidden && screen === 'play' && pause());

  function readInput() {
    const k = (list) => list.some((c) => keys.has(c));
    return { gas: input.gas || k(GAS), brake: input.brake || k(BRAKE) };
  }

  function showPopup(text, cls = '') {
    popup.textContent = text;
    popup.className = 'popup ' + cls;
    void popup.offsetWidth; // restart animation
    popup.classList.add('show');
  }

  function starsFor(t, def) {
    return t <= def.stars[0] ? 3 : t <= def.stars[1] ? 2 : 1;
  }

  function starRow(n, total = 3) {
    return Array.from({ length: total }, (_, i) => `<span class="star ${i < n ? 'on' : ''}">★</span>`).join('');
  }

  /* ---------- Screens ---------- */

  function showMenu() {
    screen = 'menu';
    sound.engine(0, 0, false);
    overlay.className = 'overlay show';
    hud.classList.remove('show');
    pedals.classList.remove('show');
    hint.classList.remove('show');
    if (!menuLevel) {
      menuLevel = buildLevel(LEVELS[0]);
      menuT = 0;
    }
    const cards = LEVELS.map((def, i) => {
      const locked = i + 1 > progress.unlocked;
      const best = progress.best[i];
      return `<button class="lvl-card ${locked ? 'locked' : ''}" data-level="${i}" ${locked ? 'disabled' : ''}>
        <span class="lvl-num">${i + 1}</span>
        <span class="lvl-title">${def.name}</span>
        <span class="lvl-stars">${locked ? '🔒' : starRow(progress.stars[i] || 0)}</span>
        <span class="lvl-best">${best != null ? fmt(best) + 's' : locked ? 'Locked' : 'Not played'}</span>
      </button>`;
    }).join('');
    overlay.innerHTML = `
      <div class="panel menu">
        <h1>${title}</h1>
        <p class="tag">${tagline}</p>
        <div class="lvl-grid">${cards}</div>
        <p class="how"><b>→ / D</b> gas · <b>← / A</b> brake &amp; reverse · in the air: gas = backflip, brake = frontflip · <b>R</b> restart · <b>P</b> pause</p>
      </div>`;
    overlay.querySelectorAll('[data-level]').forEach((b) =>
      b.addEventListener('click', () => {
        sound.unlock();
        startLevel(Number(b.dataset.level));
      }),
    );
  }

  function pause() {
    if (screen !== 'play' && screen !== 'crashed') return;
    screen = 'pause';
    sound.engine(0, 0, false);
    overlay.className = 'overlay show';
    overlay.innerHTML = `
      <div class="panel small">
        <h2>Paused</h2>
        <div class="btns">
          <button class="btn primary" data-a="resume">Resume</button>
          <button class="btn" data-a="restart">Restart level</button>
          <button class="btn" data-a="levels">All levels</button>
        </div>
      </div>`;
    overlay.querySelector('[data-a=resume]').onclick = resume;
    overlay.querySelector('[data-a=restart]').onclick = () => startLevel(levelIndex);
    overlay.querySelector('[data-a=levels]').onclick = showMenu;
  }

  function resume() {
    if (screen !== 'pause') return;
    screen = 'play';
    overlay.className = 'overlay';
    overlay.innerHTML = '';
  }

  function finish() {
    screen = 'finish';
    sound.engine(0, 0, false);
    sound.finish();
    const def = LEVELS[levelIndex];
    const final = Math.max(0, time - bonus);
    const stars = starsFor(final, def);
    const prevBest = progress.best[levelIndex];
    const isBest = prevBest == null || final < prevBest;
    if (isBest) progress.best[levelIndex] = Number(final.toFixed(2));
    progress.stars[levelIndex] = Math.max(progress.stars[levelIndex] || 0, stars);
    progress.unlocked = Math.max(progress.unlocked, Math.min(LEVELS.length, levelIndex + 2));
    save(progressKey, progress);
    for (let i = 0; i < 120; i++) {
      const p = v.chassis.getPosition();
      particles.push({
        x: p.x + (Math.random() - 0.5) * 2,
        y: p.y + 1,
        vx: (Math.random() - 0.5) * 12,
        vy: 6 + Math.random() * 10,
        life: 2 + Math.random(),
        max: 3,
        size: 0.12 + Math.random() * 0.1,
        color: ['#ff4d6d', '#ffd166', '#06d6a0', '#4cc9f0', '#b388ff'][i % 5],
        kind: 'confetti',
        rot: Math.random() * 6,
      });
    }
    const next = levelIndex + 1 < LEVELS.length;
    setTimeout(() => {
      if (screen !== 'finish') return;
      overlay.className = 'overlay show';
      overlay.innerHTML = `
        <div class="panel small">
          <h2>${next ? 'Level complete!' : 'You beat every level! 🏆'}</h2>
          <div class="result-stars">${starRow(stars)}</div>
          <div class="result-time">${fmt(final)}s ${isBest ? '<span class="best-badge">New best!</span>' : ''}</div>
          <div class="result-sub">${flips ? `Ride time ${fmt(time)}s − ${flips} flip${flips > 1 ? 's' : ''} bonus ${fmt(bonus)}s` : `Tip: land flips to knock ${VEHICLE.flipBonus}s off per flip`}</div>
          <div class="result-sub">★★★ under ${def.stars[0]}s · ★★ under ${def.stars[1]}s</div>
          <div class="btns">
            ${next ? '<button class="btn primary" data-a="next">Next level</button>' : ''}
            <button class="btn ${next ? '' : 'primary'}" data-a="retry">Retry</button>
            <button class="btn" data-a="levels">All levels</button>
          </div>
        </div>`;
      overlay.querySelector('[data-a=next]')?.addEventListener('click', () => startLevel(levelIndex + 1));
      overlay.querySelector('[data-a=retry]').onclick = () => startLevel(levelIndex);
      overlay.querySelector('[data-a=levels]').onclick = showMenu;
    }, 900);
  }

  /* ---------- Level lifecycle ---------- */

  function startLevel(i) {
    levelIndex = i;
    const def = LEVELS[i];
    level = buildLevel(def);
    v = createVehicle(level.world, VEHICLE, level.start.x, level.start.y + VEHICLE.spawnHeight);
    time = 0;
    bonus = 0;
    flips = 0;
    cpIndex = 0;
    started = false;
    particles = [];
    airRot = 0;
    lastAngle = v.chassis.getAngle();
    wasAir = false;
    acc = 0;
    const p = v.chassis.getPosition();
    cam.x = p.x + 4;
    cam.y = p.y + 1;
    screen = 'play';
    overlay.className = 'overlay';
    overlay.innerHTML = '';
    hud.classList.add('show');
    pedals.classList.add('show');
    $('.lvl-name').textContent = `${i + 1} · ${def.name}`;
    $('.timer-sub').innerHTML = `★★★ under ${def.stars[0]}s`;
    $('.progress-cps').innerHTML = level.checkpoints
      .map((c) => `<i style="left:${Math.min(100, (c.x / level.finishX) * 100)}%"></i>`)
      .join('');
    hint.textContent = matchMedia('(pointer: coarse)').matches ? 'Hold GAS to go' : 'Press → or D to go';
    hint.classList.add('show');
  }

  function respawn() {
    const cp = cpIndex > 0 ? level.checkpoints[cpIndex - 1] : level.start;
    destroyVehicle(level.world, v);
    v = createVehicle(level.world, VEHICLE, cp.x, groundY(level, cp.x) + VEHICLE.spawnHeight);
    airRot = 0;
    lastAngle = v.chassis.getAngle();
    wasAir = false;
    screen = 'play';
  }

  function crash(reason) {
    if (screen !== 'play') return;
    screen = 'crashed';
    respawnAt = performance.now() + 1100;
    sound.crash();
    flash.classList.remove('show');
    void flash.offsetWidth;
    flash.classList.add('show');
    showPopup(reason === 'fell' ? 'Fell off!' : 'Crashed!', 'bad');
    const p = v.chassis.getPosition();
    for (let i = 0; i < 24; i++) {
      particles.push({ x: p.x, y: p.y, vx: (Math.random() - 0.5) * 8, vy: Math.random() * 7, life: 0.9, max: 0.9, size: 0.12, color: THEME.edge, kind: 'spark' });
    }
  }

  /* ---------- Simulation step ---------- */

  function step(dt) {
    const world = level.world;
    const ctrl = screen === 'play' ? readInput() : { gas: false, brake: false };
    if (screen === 'play' && !started && (ctrl.gas || ctrl.brake)) {
      started = true;
      hint.classList.remove('show');
    }
    const pos = v.chassis.getPosition();
    driveVehicle(v, ctrl, dt, slopeAt(level, pos.x));
    updateLevel(level, v, dt);
    world.step(dt, 8, 3);

    for (const d of sweepBroken(level)) {
      sound.smash();
      for (let i = 0; i < 8; i++) {
        particles.push({ x: d.x, y: d.y, vx: (Math.random() - 0.3) * 9, vy: Math.random() * 7, life: 1.4, max: 1.4, size: d.size * 0.32, color: '#c98a45', kind: 'debris', rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14 });
      }
    }

    if (screen !== 'play') return;
    if (started) time += dt;

    // Flips: add up rotation while airborne, award on landing.
    const ang = v.chassis.getAngle();
    const inAir = !v.grounded;
    if (inAir) airRot += ang - lastAngle;
    else if (wasAir) {
      const n = Math.floor((Math.abs(airRot) + 0.6) / (Math.PI * 2));
      if (n > 0) {
        flips += n;
        bonus += n * VEHICLE.flipBonus;
        sound.flip();
        const name = airRot > 0 ? 'Backflip' : 'Frontflip';
        showPopup(`${n > 1 ? n + '× ' : ''}${name}!  −${(n * VEHICLE.flipBonus).toFixed(1)}s`, 'good');
      }
      airRot = 0;
    }
    if (!inAir) airRot = 0;
    wasAir = inAir;
    lastAngle = ang;

    // Dust from the driven wheel
    if (v.grounded && ctrl.gas && Math.random() < 0.6) {
      const w = v.wheels.find((x) => x.drive) || v.wheels[0];
      const wp = w.body.getPosition();
      particles.push({ x: wp.x - 0.2, y: wp.y - w.r * 0.8, vx: -1 - Math.random() * 2, vy: Math.random() * 1.5, life: 0.6, max: 0.6, size: 0.18 + Math.random() * 0.15, color: THEME.dust || 'rgba(255,255,255,0.35)', kind: 'dust' });
    }

    const p = v.chassis.getPosition();
    while (cpIndex < level.checkpoints.length && p.x >= level.checkpoints[cpIndex].x) {
      cpIndex++;
      sound.checkpoint();
      showPopup('Checkpoint!', 'good');
    }
    if (p.x >= level.finishX) return finish();
    if (headHit(v)) return crash('head');
    if (touchingSpikes(v)) return crash('spikes');
    if (p.y < level.killY) return crash('fell');
  }

  /* ---------- Rendering ---------- */

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = canvas.width = Math.floor(innerWidth * dpr);
    H = canvas.height = Math.floor(innerHeight * dpr);
    // Landscape shows ~25 m of track; portrait zooms in so the vehicle isn't tiny.
    const portrait = innerHeight > innerWidth;
    const pxPerMeter = portrait ? Math.max(innerWidth / 15, innerHeight / 26) : Math.min(innerWidth, innerHeight * 1.7) / 25;
    cam.s = Math.max(16, Math.min(64, pxPerMeter)) * dpr;
  }
  addEventListener('resize', resize);
  resize();

  function hillLayer(offset, base, amp, color, seed) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W + 40; x += 20 * dpr) {
      const u = (x + offset) / (260 * dpr);
      const y = base - amp * (0.55 * Math.sin(u + seed) + 0.3 * Math.sin(u * 2.3 + seed * 2) + 0.15 * Math.sin(u * 5.1 + seed));
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
  }

  function drawBackground() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, THEME.sky[0]);
    g.addColorStop(0.55, THEME.sky[1]);
    g.addColorStop(1, THEME.sky[2]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // sun
    ctx.fillStyle = THEME.sun || 'rgba(255,240,200,0.85)';
    ctx.beginPath();
    ctx.arc(W * 0.78 - cam.x * cam.s * 0.02, H * 0.3, Math.min(W, H) * 0.08, 0, Math.PI * 2);
    ctx.fill();
    hillLayer(cam.x * cam.s * 0.12, H * 0.62 + cam.y * cam.s * 0.05, H * 0.18, THEME.far, 1.3);
    hillLayer(cam.x * cam.s * 0.3, H * 0.74 + cam.y * cam.s * 0.12, H * 0.14, THEME.near, 4.1);
  }

  function setWorld() {
    ctx.setTransform(cam.s, 0, 0, -cam.s, W / 2 - cam.x * cam.s, H / 2 + cam.y * cam.s);
  }

  function drawTerrain(lv, minX, maxX) {
    const bottom = lv.killY - 40;
    const grad = ctx.createLinearGradient(0, cam.y + 6, 0, cam.y - 14);
    grad.addColorStop(0, THEME.ground[0]);
    grad.addColorStop(1, THEME.ground[1]);
    for (const chain of lv.track.chains) {
      if (chain.length < 2) continue;
      if (chain[chain.length - 1][0] < minX || chain[0][0] > maxX) continue;
      ctx.beginPath();
      ctx.moveTo(chain[0][0], chain[0][1]);
      for (let i = 1; i < chain.length; i++) ctx.lineTo(chain[i][0], chain[i][1]);
      ctx.lineTo(chain[chain.length - 1][0], bottom);
      ctx.lineTo(chain[0][0], bottom);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(chain[0][0], chain[0][1]);
      for (let i = 1; i < chain.length; i++) ctx.lineTo(chain[i][0], chain[i][1]);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = THEME.edgeWidth * 2.2;
      ctx.stroke();
      ctx.strokeStyle = THEME.edge;
      ctx.lineWidth = THEME.edgeWidth;
      ctx.stroke();
    }
  }

  function withBody(body, fn) {
    const p = body.getPosition();
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(body.getAngle());
    fn();
    ctx.restore();
  }

  function rect(x, y, w, h) {
    ctx.beginPath();
    ctx.rect(x, y, w, h);
  }

  function drawObjects(lv, t) {
    for (const z of lv.zones) {
      if (z.type === 'boost') {
        ctx.fillStyle = 'rgba(80,255,200,0.18)';
        ctx.fillRect(z.x0, z.y, z.x1 - z.x0, 0.12);
        ctx.strokeStyle = `hsl(${160 + 20 * Math.sin(t * 6)},100%,60%)`;
        ctx.lineWidth = 0.12;
        for (let x = z.x0 + 0.4; x < z.x1 - 0.3; x += 0.9) {
          const ph = (x * 1.3 - t * 6) % 1;
          ctx.globalAlpha = 0.45 + 0.55 * Math.abs(Math.sin(ph * Math.PI));
          ctx.beginPath();
          ctx.moveTo(x, z.y + 0.12);
          ctx.lineTo(x + 0.35, z.y + 0.32);
          ctx.lineTo(x, z.y + 0.52);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      } else if (z.type === 'spikes') {
        const n = Math.max(1, Math.round((z.x1 - z.x0) / 0.6));
        const w = (z.x1 - z.x0) / n;
        ctx.fillStyle = '#c9ccd6';
        ctx.strokeStyle = '#5b5f6e';
        ctx.lineWidth = 0.05;
        for (let i = 0; i < n; i++) {
          const x = z.x0 + i * w;
          ctx.beginPath();
          ctx.moveTo(x, z.y);
          ctx.lineTo(x + w, z.y);
          ctx.lineTo(x + w / 2, z.y + 0.55);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      } else if (z.type === 'flag') {
        const finishFlag = z.kind === 'finish';
        const reached = !finishFlag && lv === level && lv.checkpoints.findIndex((c) => Math.abs(c.x - z.x) < 0.01) < cpIndex;
        ctx.strokeStyle = '#eee';
        ctx.lineWidth = 0.1;
        ctx.beginPath();
        ctx.moveTo(z.x, z.y);
        ctx.lineTo(z.x, z.y + (finishFlag ? 4 : 3));
        ctx.stroke();
        const top = z.y + (finishFlag ? 4 : 3);
        const wave = Math.sin(t * 5) * 0.12;
        if (finishFlag) {
          for (let r = 0; r < 3; r++)
            for (let c = 0; c < 4; c++) {
              ctx.fillStyle = (r + c) % 2 ? '#111' : '#fff';
              ctx.fillRect(z.x + c * 0.4, top - 0.4 - r * 0.4 + wave * (c / 4), 0.4, 0.4);
            }
          ctx.strokeStyle = 'rgba(255,255,255,0.35)';
          ctx.setLineDash([0.3, 0.3]);
          ctx.beginPath();
          ctx.moveTo(z.x, z.y);
          ctx.lineTo(z.x, z.y + 4);
          ctx.stroke();
          ctx.setLineDash([]);
        } else {
          ctx.fillStyle = reached ? '#3ddc97' : '#ffd166';
          ctx.beginPath();
          ctx.moveTo(z.x, top);
          ctx.lineTo(z.x + 1.1, top - 0.35 + wave);
          ctx.lineTo(z.x, top - 0.7);
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    for (const d of lv.dynamic) {
      const b = d.body;
      withBody(b, () => {
        if (d.type === 'crate') {
          const s = d.size / 2;
          ctx.fillStyle = '#d0904a';
          ctx.strokeStyle = '#7a4a1c';
          ctx.lineWidth = d.size * 0.08;
          rect(-s, -s, d.size, d.size);
          ctx.fill();
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(-s, -s);
          ctx.lineTo(s, s);
          ctx.moveTo(-s, s);
          ctx.lineTo(s, -s);
          ctx.stroke();
        } else if (d.type === 'boulder') {
          ctx.fillStyle = '#8f8a85';
          ctx.strokeStyle = '#55514d';
          ctx.lineWidth = 0.08;
          ctx.beginPath();
          ctx.arc(0, 0, d.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#76716c';
          ctx.beginPath();
          ctx.arc(d.r * 0.35, d.r * 0.2, d.r * 0.22, 0, Math.PI * 2);
          ctx.arc(-d.r * 0.3, -d.r * 0.35, d.r * 0.15, 0, Math.PI * 2);
          ctx.fill();
        } else if (d.type === 'plank') {
          ctx.fillStyle = '#9a6533';
          ctx.strokeStyle = '#5a3613';
          ctx.lineWidth = 0.05;
          const hw = d.len / 2;
          const hh = d.pivot ? 0.13 : 0.1;
          rect(-hw, -hh, d.len, hh * 2);
          ctx.fill();
          ctx.stroke();
          if (d.pivot) {
            ctx.fillStyle = '#444';
            ctx.beginPath();
            ctx.arc(0, 0, 0.1, 0, Math.PI * 2);
            ctx.fill();
          }
        } else if (d.type === 'pivot') {
          ctx.fillStyle = '#5b5f6e';
          ctx.beginPath();
          ctx.moveTo(-0.7, -d.h);
          ctx.lineTo(0.7, -d.h);
          ctx.lineTo(0, -0.05);
          ctx.closePath();
          ctx.fill();
        } else if (d.type === 'platform') {
          const hw = d.w / 2;
          ctx.fillStyle = d.moving ? '#3a3f55' : THEME.ground[0];
          rect(-hw, -0.25, d.w, 0.5);
          ctx.fill();
          ctx.fillStyle = d.moving ? '#ffd166' : THEME.edge;
          rect(-hw, 0.13, d.w, 0.12);
          ctx.fill();
          if (d.moving) {
            ctx.fillStyle = '#111';
            for (let x = -hw; x < hw - 0.3; x += 0.6) {
              ctx.beginPath();
              ctx.moveTo(x, 0.13);
              ctx.lineTo(x + 0.3, 0.13);
              ctx.lineTo(x + 0.45, 0.25);
              ctx.lineTo(x + 0.15, 0.25);
              ctx.closePath();
              ctx.fill();
            }
          }
        }
      });
    }
  }

  function drawWheel(w) {
    withBody(w.body, () => {
      const r = w.r;
      ctx.fillStyle = '#1b1b1f';
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#34343c';
      ctx.lineWidth = r * 0.12;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.86, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#c7ccd8';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#7b8193';
      ctx.lineWidth = r * 0.09;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * r * 0.52, Math.sin(a) * r * 0.52);
        ctx.stroke();
      }
      ctx.fillStyle = '#555b6b';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.15, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function line(points, width, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.stroke();
  }

  function poly(points, fill, stroke, width = 0.05) {
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = width;
      ctx.stroke();
    }
  }

  function drawBike(veh) {
    const [rear, front] = veh.wheels;
    const rl = veh.chassis.getLocalPoint(rear.body.getPosition());
    const fl = veh.chassis.getLocalPoint(front.body.getPosition());
    drawWheel(rear);
    drawWheel(front);
    withBody(veh.chassis, () => {
      line([[-0.2, -0.02], [rl.x, rl.y]], 0.11, '#2b2b33'); // swingarm
      line([[0.58, 0.32], [fl.x, fl.y]], 0.1, '#c9ccd6'); // fork
      line([[-0.45, -0.05], [-0.9, 0.12]], 0.09, '#8b8f9c'); // exhaust
      poly(VEHICLE.body[0].points, THEME.bike, '#7a1d1d', 0.05);
      poly([[-0.55, 0.2], [-0.05, 0.3], [0.0, 0.38], [-0.5, 0.32]], '#1f1f26');
      poly([[0.12, 0.12], [0.55, 0.12], [0.62, 0.26], [0.2, 0.3]], '#ffffff22');
      line([[0.5, 0.48], [0.6, 0.56]], 0.07, '#222'); // bars
      // rider
      line([[-0.18, 0.38], [0.15, 0.22], [0.04, -0.02]], 0.13, '#23232b'); // leg
      line([[-0.18, 0.38], [0.05, 0.84]], 0.24, THEME.rider || '#f3f3f7'); // torso
      line([[0.06, 0.78], [0.32, 0.6], [0.52, 0.52]], 0.09, THEME.rider || '#f3f3f7'); // arm
      ctx.fillStyle = THEME.helmet || THEME.bike;
      ctx.beginPath();
      ctx.arc(VEHICLE.head.x, VEHICLE.head.y, VEHICLE.head.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1b1b22';
      ctx.beginPath();
      ctx.arc(VEHICLE.head.x + 0.04, VEHICLE.head.y, VEHICLE.head.r * 0.7, -0.6, 0.6);
      ctx.lineTo(VEHICLE.head.x + 0.04, VEHICLE.head.y);
      ctx.fill();
    });
  }

  function drawTruck(veh) {
    for (const w of veh.wheels) {
      const l = veh.chassis.getLocalPoint(w.body.getPosition());
      withBody(veh.chassis, () => line([[w.local.x, -0.1], [l.x, l.y]], 0.16, '#3a3a44'));
    }
    for (const w of veh.wheels) drawWheel(w);
    withBody(veh.chassis, () => {
      poly(VEHICLE.body[0].points, THEME.truck, '#0f2a66', 0.06);
      poly(VEHICLE.body[1].points, THEME.truck, '#0f2a66', 0.06);
      poly([[-0.2, 0.28], [0.62, 0.28], [0.47, 0.75], [-0.14, 0.75]], '#bfe9ff', '#0f2a66', 0.04);
      line([[-1.4, 0.0], [1.4, 0.0]], 0.09, '#ffffffcc'); // racing stripe
      poly([[-0.15, 0.85], [0.5, 0.85], [0.5, 0.95], [-0.15, 0.95]], '#222');
      ctx.fillStyle = '#ffd166';
      for (const x of [-0.05, 0.15, 0.35]) {
        ctx.beginPath();
        ctx.arc(x, 0.97, 0.06, 0, Math.PI * 2);
        ctx.fill();
      }
      poly([[1.4, -0.22], [1.62, -0.22], [1.62, 0.08], [1.45, 0.12]], '#2b2b33'); // bumper
      ctx.fillStyle = '#fff6a8';
      ctx.beginPath();
      ctx.arc(1.47, 0.08, 0.07, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawParticles(dt) {
    const g = 14;
    particles = particles.filter((p) => (p.life -= dt) > 0);
    for (const p of particles) {
      p.vy -= (p.kind === 'dust' ? 2 : p.kind === 'confetti' ? 6 : g) * dt;
      if (p.kind === 'confetti') p.vx *= 0.99;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if ((p.kind === 'debris' || p.kind === 'confetti') && level && screen !== 'menu') {
        const gy = groundY(level, p.x) + p.size / 2;
        if (p.y < gy && p.y > gy - 1.5) {
          p.y = gy;
          p.vy = Math.abs(p.vy) * 0.25;
          p.vx *= 0.6;
          p.vr = (p.vr || 0) * 0.5;
        }
      }
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.max));
      ctx.fillStyle = p.color;
      if (p.kind === 'debris' || p.kind === 'confetti') {
        p.rot = (p.rot || 0) + (p.vr || 6) * dt;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.kind === 'confetti' ? p.size * 0.5 : p.size);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (p.kind === 'dust' ? 1 + (1 - p.life / p.max) : 1), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  let t0 = performance.now();
  let lastFrame = t0;

  function frame(now) {
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    const t = (now - t0) / 1000;

    if (screen === 'play' || screen === 'crashed' || screen === 'finish') {
      acc += dt;
      let n = 0;
      while (acc >= STEP && n < 5) {
        step(STEP);
        acc -= STEP;
        n++;
      }
      if (screen === 'crashed' && now >= respawnAt) respawn();
    } else if (screen === 'menu' && menuLevel) {
      menuT += dt;
      updateLevel(menuLevel, null, dt);
      menuLevel.world.step(dt);
    }

    // camera
    const lv = screen === 'menu' ? menuLevel : level;
    let tx;
    let ty;
    if (screen === 'menu' || !v) {
      tx = 8 + ((menuT * 3) % Math.max(20, (lv?.finishX || 100) - 10));
      ty = groundY(lv, tx) + 2.5;
      cam.x = tx;
      cam.y += (ty - cam.y) * 0.05;
    } else {
      const p = v.chassis.getPosition();
      const vel = v.chassis.getLinearVelocity();
      tx = p.x + Math.max(-4, Math.min(6, vel.x * 0.35)) + 2;
      ty = p.y + 1.2 + Math.max(-2, Math.min(2, vel.y * 0.1));
      const k = 1 - Math.exp(-dt * 5);
      cam.x += (tx - cam.x) * k;
      cam.y += (ty - cam.y) * k;
    }

    drawBackground();
    if (lv) {
      setWorld();
      const half = W / 2 / cam.s + 2;
      drawTerrain(lv, cam.x - half, cam.x + half);
      drawObjects(lv, t);
      if (v && screen !== 'menu') VEHICLE.kind === 'bike' ? drawBike(v) : drawTruck(v);
      drawParticles(dt);
    }

    // HUD + engine sound
    if (screen !== 'menu' && level) {
      $('.timer').textContent = fmt(Math.max(0, time - bonus));
      const prog = Math.max(0, Math.min(1, v.chassis.getPosition().x / level.finishX));
      $('.progress-bar').style.width = `${prog * 100}%`;
      const drive = v.wheels.find((w) => w.drive) || v.wheels[0];
      const rpm = Math.abs(drive.body.getAngularVelocity());
      const ctrl = readInput();
      sound.engine(rpm, ctrl.gas ? 1 : 0, screen === 'play' || screen === 'crashed');
    }
    requestAnimationFrame(frame);
  }

  showMenu();
  requestAnimationFrame(frame);
}
