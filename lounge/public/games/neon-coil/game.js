// Neon Coil: an arena snake game with AI rivals. Pure canvas, no libraries.
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const mini = document.getElementById('minimap');
const mctx = mini.getContext('2d');

const ARENA = 2400; // arena radius (world units)
const FOOD_TARGET = 1500;
const BOT_COUNT = 18;
const SPACING = 6; // distance between stored body points
const BASE_SPEED = 150; // units per second
const BOOST_MULT = 2;
const STEP = 1 / 60;
const CELL = 64;

const HUES = [190, 300, 50, 130, 20, 260, 340, 90];
const BOT_NAMES = [
  'Noodle', 'Zigzag', 'Byte', 'Sir Wiggles', 'Pixel', 'Comet', 'Mamba', 'Glowstick', 'Tofu', 'Vortex',
  'Squiggle', 'Lumen', 'Neon Ned', 'Spaghetti', 'Rumble', 'Kiwi', 'Static', 'Orbit', 'Laser', 'Biscuit',
  'Wobble', 'Nova', 'Slinky', 'Fizz', 'Echo', 'Mochi', 'Dash', 'Zap', 'Jellybean', 'Ripple',
];

const radiusFor = (mass) => 7 + 5.5 * Math.sqrt(mass / 100);
const lengthFor = (mass) => 60 + Math.pow(mass, 0.85) * 3;
const turnRate = (r) => Math.max(2.2, 5.2 - r * 0.07);
const rand = (a, b) => a + Math.random() * (b - a);
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

function load(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}
function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

/* ---------- State ---------- */

let snakes = [];
let foods = [];
let particles = [];
let player = null;
let nextId = 1;
let state = 'menu'; // menu | play | dead
let deathInfo = null;
let best = load('neon-coil:best', 0);
let playerName = load('neon-coil:name', '');
let playerHue = load('neon-coil:hue', HUES[0]);
let camera = { x: 0, y: 0, zoom: 1 };
let W = 0;
let H = 0;
let dpr = 1;
let time = 0;
let botTimers = [];

const pointer = { x: 0, y: 0, active: false };
let boostHeld = false;
const keys = new Set();

/* ---------- Spatial grids ---------- */

const segGrid = new Map();
const foodGrid = new Map();
const key = (cx, cy) => (cx + 256) * 1024 + (cy + 256);

function buildSegGrid() {
  segGrid.clear();
  for (const s of snakes) {
    if (!s.alive) continue;
    const r = s.r;
    const pts = s.pts;
    // include every other point (dense enough for collisions) + the head
    for (let i = 0; i < pts.length; i += 2) {
      const p = pts[i];
      const k = key(Math.floor(p.x / CELL), Math.floor(p.y / CELL));
      let cell = segGrid.get(k);
      if (!cell) segGrid.set(k, (cell = []));
      cell.push(s, p.x, p.y, r);
    }
  }
}

function buildFoodGrid() {
  foodGrid.clear();
  for (const f of foods) {
    const k = key(Math.floor(f.x / 128), Math.floor(f.y / 128));
    let cell = foodGrid.get(k);
    if (!cell) foodGrid.set(k, (cell = []));
    cell.push(f);
  }
}

/** Returns the snake whose body is within `rad` of (x, y), ignoring `self`. */
function bodyAt(x, y, rad, self) {
  const cx = Math.floor(x / CELL);
  const cy = Math.floor(y / CELL);
  const span = Math.ceil((rad + 40) / CELL);
  for (let i = cx - span; i <= cx + span; i++) {
    for (let j = cy - span; j <= cy + span; j++) {
      const cell = segGrid.get(key(i, j));
      if (!cell) continue;
      for (let n = 0; n < cell.length; n += 4) {
        const s = cell[n];
        if (s === self) continue;
        const dx = cell[n + 1] - x;
        const dy = cell[n + 2] - y;
        const rr = rad + cell[n + 3];
        if (dx * dx + dy * dy < rr * rr) return s;
      }
    }
  }
  return null;
}

function foodNear(x, y, rad, out) {
  out.length = 0;
  const cx = Math.floor(x / 128);
  const cy = Math.floor(y / 128);
  const span = Math.ceil(rad / 128);
  for (let i = cx - span; i <= cx + span; i++) {
    for (let j = cy - span; j <= cy + span; j++) {
      const cell = foodGrid.get(key(i, j));
      if (cell) for (const f of cell) out.push(f);
    }
  }
  return out;
}

/* ---------- Spawning ---------- */

function randomPointInArena(margin = 200) {
  const a = Math.random() * Math.PI * 2;
  const d = Math.sqrt(Math.random()) * (ARENA - margin);
  return { x: Math.cos(a) * d, y: Math.sin(a) * d };
}

function safeSpawnPoint() {
  for (let tries = 0; tries < 40; tries++) {
    const p = randomPointInArena(400);
    let ok = true;
    for (const s of snakes) {
      if (!s.alive) continue;
      if (Math.hypot(s.x - p.x, s.y - p.y) < 420) {
        ok = false;
        break;
      }
    }
    if (ok && !bodyAt(p.x, p.y, 200, null)) return p;
  }
  return randomPointInArena(400);
}

function makeFood(x, y, value, hue, dropped = false) {
  return {
    x,
    y,
    value,
    hue,
    r: 3.2 + Math.sqrt(value) * 2.4,
    phase: Math.random() * Math.PI * 2,
    life: dropped ? rand(25, 40) : Infinity,
    vx: 0,
    vy: 0,
  };
}

function spawnNaturalFood() {
  const p = randomPointInArena(30);
  foods.push(makeFood(p.x, p.y, Math.random() < 0.1 ? 3 : rand(0.8, 1.8), HUES[(Math.random() * HUES.length) | 0]));
}

function createSnake({ name, hue, mass, bot }) {
  const p = safeSpawnPoint();
  const angle = Math.random() * Math.PI * 2;
  const s = {
    id: nextId++,
    name,
    hue,
    mass,
    x: p.x,
    y: p.y,
    angle,
    target: angle,
    pts: [],
    since: 0,
    boost: false,
    alive: true,
    bot: bot ? { think: Math.random() * 0.2, aggression: Math.random(), wander: angle } : null,
    kills: 0,
    r: radiusFor(mass),
    dash: 0,
  };
  // pre-build a short tail behind the head
  const len = lengthFor(mass);
  for (let d = len; d >= 0; d -= SPACING) s.pts.push({ x: p.x - Math.cos(angle) * d, y: p.y - Math.sin(angle) * d });
  snakes.push(s);
  return s;
}

function spawnBot() {
  const used = new Set(snakes.filter((s) => s.alive).map((s) => s.name));
  const name = BOT_NAMES.filter((n) => !used.has(n))[(Math.random() * 10) | 0] || 'Bot';
  const big = Math.random() < 0.25;
  createSnake({ name, hue: HUES[(Math.random() * HUES.length) | 0] + rand(-12, 12), mass: big ? rand(150, 420) : rand(15, 90), bot: true });
}

/* ---------- Simulation ---------- */

function kill(s, killer) {
  if (!s.alive) return;
  s.alive = false;
  // Leave a trail of glowing food where the snake died
  const count = Math.max(6, Math.min(160, Math.floor(s.pts.length / 2)));
  const value = (s.mass * 0.75) / count;
  for (let i = 0; i < count; i++) {
    const p = s.pts[Math.floor((i / count) * s.pts.length)] || s;
    foods.push(makeFood(p.x + rand(-s.r, s.r) * 0.7, p.y + rand(-s.r, s.r) * 0.7, value, s.hue, true));
  }
  for (let i = 0; i < 30; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = rand(60, 260);
    particles.push({ x: s.x, y: s.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.4, 0.9), max: 0.9, hue: s.hue, size: rand(2, 5) });
  }
  if (killer && killer.alive) killer.kills++;
  if (s === player) {
    state = 'dead';
    deathInfo = { killer: killer ? killer.name : null, mass: Math.floor(s.mass), kills: s.kills };
    if (deathInfo.mass > best) {
      best = deathInfo.mass;
      save('neon-coil:best', best);
    }
    showDeath();
  } else {
    botTimers.push(time + rand(1.5, 4));
  }
}

function steerPlayer(dt) {
  if (keys.has('ArrowLeft') || keys.has('KeyA')) player.target = player.angle - 3.5 * dt * 4;
  else if (keys.has('ArrowRight') || keys.has('KeyD')) player.target = player.angle + 3.5 * dt * 4;
  else if (pointer.active) player.target = Math.atan2(pointer.y - H / 2, pointer.x - W / 2);
  player.boost = boostHeld || keys.has('Space') || keys.has('ArrowUp') || keys.has('KeyW');
}

const tmpFood = [];

function botThink(b) {
  const r = b.r;
  const look = 60 + r * 3 + (b.boost ? 70 : 0);
  const danger = (a) => {
    let d = 0;
    for (const k of [0.4, 0.75, 1]) {
      const px = b.x + Math.cos(a) * look * k;
      const py = b.y + Math.sin(a) * look * k;
      if (px * px + py * py > (ARENA - 50) * (ARENA - 50)) d += 2 / k;
      if (bodyAt(px, py, r + 8, b)) d += 1 / k;
    }
    return d;
  };

  // 1) Don't crash
  if (danger(b.angle) > 0) {
    let bestA = b.angle;
    let bestD = Infinity;
    for (const da of [0.5, -0.5, 1, -1, 1.6, -1.6, 2.3, -2.3, Math.PI]) {
      const d = danger(b.angle + da);
      if (d < bestD) {
        bestD = d;
        bestA = b.angle + da;
        if (d === 0) break;
      }
    }
    b.target = bestA;
    b.boost = false;
    return;
  }

  // 2) Hunt: big, aggressive bots try to cut off the player
  if (player && player.alive && b.bot.aggression > 0.6 && b.mass > player.mass * 1.2) {
    const dx = player.x - b.x;
    const dy = player.y - b.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 320) {
      const lead = 90 + player.r * 3;
      const tx = player.x + Math.cos(player.angle) * lead;
      const ty = player.y + Math.sin(player.angle) * lead;
      b.target = Math.atan2(ty - b.y, tx - b.x);
      b.boost = b.mass > 40 && dist < 220 && Math.random() < 0.6;
      return;
    }
  }

  // 3) Eat: prefer big, close food in front
  let bestScore = 0;
  let tx = 0;
  let ty = 0;
  for (const f of foodNear(b.x, b.y, 380, tmpFood)) {
    const dx = f.x - b.x;
    const dy = f.y - b.y;
    const d = Math.hypot(dx, dy);
    if (d > 380) continue;
    const off = Math.abs(angleDiff(Math.atan2(dy, dx), b.angle));
    const score = (f.value / (d + 50)) * (off < 1.2 ? 1.5 : 0.6);
    if (score > bestScore) {
      bestScore = score;
      tx = f.x;
      ty = f.y;
    }
  }
  if (bestScore > 0) {
    b.target = Math.atan2(ty - b.y, tx - b.x);
    b.boost = bestScore > 0.12 && b.mass > 40 && Math.random() < 0.35;
  } else {
    b.bot.wander += rand(-0.6, 0.6);
    b.target = b.bot.wander;
    b.boost = false;
  }

  // 4) Stay away from the wall
  if (Math.hypot(b.x, b.y) > ARENA - 300) {
    b.target = Math.atan2(-b.y, -b.x) + rand(-0.5, 0.5);
    b.bot.wander = b.target;
  }
}

function moveSnake(s, dt) {
  if (s.bot) {
    s.bot.think -= dt;
    if (s.bot.think <= 0) {
      s.bot.think = rand(0.1, 0.16);
      botThink(s);
    }
  }
  const canBoost = s.boost && s.mass > 12;
  const speed = BASE_SPEED * (canBoost ? BOOST_MULT : 1);
  const tr = turnRate(s.r) * dt;
  const diff = angleDiff(s.target, s.angle);
  s.angle += Math.max(-tr, Math.min(tr, diff));
  const step = speed * dt;
  s.x += Math.cos(s.angle) * step;
  s.y += Math.sin(s.angle) * step;
  s.dash += step;

  if (canBoost) {
    const cost = 5 * dt;
    s.mass -= cost;
    s.boostDrop = (s.boostDrop || 0) + cost;
    if (s.boostDrop > 2.5) {
      const tail = s.pts[0] || s;
      foods.push(makeFood(tail.x + rand(-4, 4), tail.y + rand(-4, 4), s.boostDrop * 0.6, s.hue, true));
      s.boostDrop = 0;
    }
  }

  // body points
  s.since += step;
  while (s.since >= SPACING) {
    s.since -= SPACING;
    s.pts.push({ x: s.x, y: s.y });
  }
  const maxPts = Math.ceil(lengthFor(s.mass) / SPACING);
  if (s.pts.length > maxPts) s.pts.splice(0, s.pts.length - maxPts);
  s.r += (radiusFor(s.mass) - s.r) * Math.min(1, dt * 4);
}

function eat(s, dt) {
  const reach = s.r + 26 + s.r * 1.2;
  for (const f of foodNear(s.x, s.y, reach + 10, tmpFood)) {
    if (f.eaten) continue;
    const dx = s.x - f.x;
    const dy = s.y - f.y;
    const d = Math.hypot(dx, dy);
    if (d < s.r + f.r + 2) {
      f.eaten = true;
      s.mass += f.value;
    } else if (d < reach) {
      // gentle magnet pull toward the head
      const pull = 320 * dt;
      f.x += (dx / d) * pull;
      f.y += (dy / d) * pull;
    }
  }
}

function update(dt) {
  time += dt;
  if (state === 'play') steerPlayer(dt);

  for (const s of snakes) if (s.alive) moveSnake(s, dt);
  buildSegGrid();

  // collisions
  for (const s of snakes) {
    if (!s.alive) continue;
    if (s.x * s.x + s.y * s.y > (ARENA - s.r) * (ARENA - s.r)) {
      kill(s, null);
      continue;
    }
    const hit = bodyAt(s.x, s.y, s.r * 0.8, s);
    if (hit) kill(s, hit);
  }

  buildFoodGrid();
  for (const s of snakes) if (s.alive) eat(s, dt);

  // food upkeep
  let natural = 0;
  foods = foods.filter((f) => {
    if (f.eaten) return false;
    if (f.life !== Infinity) {
      f.life -= dt;
      if (f.life <= 0) return false;
    } else natural++;
    return true;
  });
  for (let i = natural; i < FOOD_TARGET && i < natural + 20; i++) spawnNaturalFood();

  snakes = snakes.filter((s) => s.alive || s === player);
  botTimers = botTimers.filter((t) => {
    if (time >= t) {
      spawnBot();
      return false;
    }
    return true;
  });

  for (const p of particles) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.96;
    p.vy *= 0.96;
  }
  particles = particles.filter((p) => p.life > 0);
}

/* ---------- Rendering ---------- */

const sprites = new Map();
function glowSprite(hue) {
  const h = Math.round(hue / 10) * 10;
  if (sprites.has(h)) return sprites.get(h);
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, `hsla(${h},100%,92%,1)`);
  grad.addColorStop(0.25, `hsla(${h},100%,65%,0.9)`);
  grad.addColorStop(0.6, `hsla(${h},100%,55%,0.25)`);
  grad.addColorStop(1, `hsla(${h},100%,50%,0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  sprites.set(h, c);
  return c;
}

function resize() {
  dpr = Math.min(2, devicePixelRatio || 1);
  W = innerWidth;
  H = innerHeight;
  canvas.width = Math.floor(W * dpr);
  canvas.height = Math.floor(H * dpr);
  mini.width = mini.height = 140 * dpr;
}
addEventListener('resize', resize);
resize();

function snakePath(s) {
  const pts = s.pts;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.lineTo(s.x, s.y);
}

function drawSnake(s) {
  if (s.pts.length < 2) return;
  const r = s.r;
  const boosting = s.boost && s.mass > 12;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  snakePath(s);
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = `hsla(${s.hue},100%,60%,${boosting ? 0.32 + 0.12 * Math.sin(time * 20) : 0.16})`;
  ctx.lineWidth = r * 3.2;
  ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = `hsl(${s.hue},85%,45%)`;
  ctx.lineWidth = r * 2;
  ctx.stroke();
  ctx.strokeStyle = `hsl(${s.hue},100%,72%)`;
  ctx.lineWidth = r * 0.9;
  ctx.setLineDash([r * 0.6, r * 1.2]);
  ctx.lineDashOffset = s.dash;
  ctx.stroke();
  ctx.setLineDash([]);

  // head
  ctx.fillStyle = `hsl(${s.hue},90%,58%)`;
  ctx.beginPath();
  ctx.arc(s.x, s.y, r * 1.08, 0, Math.PI * 2);
  ctx.fill();
  const look = s === player && pointer.active ? Math.atan2(pointer.y - H / 2, pointer.x - W / 2) : s.target;
  for (const side of [-1, 1]) {
    const ea = s.angle + side * 0.62;
    const ex = s.x + Math.cos(ea) * r * 0.55;
    const ey = s.y + Math.sin(ea) * r * 0.55;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(ex, ey, r * 0.38, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0a0d1a';
    ctx.beginPath();
    ctx.arc(ex + Math.cos(look) * r * 0.15, ey + Math.sin(look) * r * 0.15, r * 0.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function render() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#05070f';
  ctx.fillRect(0, 0, W, H);

  const focus = player && (player.alive || state === 'dead') ? player : null;
  const target = focus || { x: Math.cos(time * 0.05) * 600, y: Math.sin(time * 0.05) * 600, r: 12 };
  camera.x += (target.x - camera.x) * 0.15;
  camera.y += (target.y - camera.y) * 0.15;
  const base = Math.min(W, H) / 820;
  const wantZoom = base * Math.max(0.45, Math.min(1.15, 1.2 - (target.r - 8) * 0.018));
  camera.zoom += (wantZoom - camera.zoom) * 0.05;
  const z = camera.zoom;

  ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (W / 2 - camera.x * z), dpr * (H / 2 - camera.y * z));
  const vw = W / z / 2 + 60;
  const vh = H / z / 2 + 60;
  const minX = camera.x - vw;
  const maxX = camera.x + vw;
  const minY = camera.y - vh;
  const maxY = camera.y + vh;

  // grid
  ctx.strokeStyle = 'rgba(90,130,255,0.07)';
  ctx.lineWidth = 1.5 / z;
  ctx.beginPath();
  for (let x = Math.floor(minX / 100) * 100; x < maxX; x += 100) {
    ctx.moveTo(x, minY);
    ctx.lineTo(x, maxY);
  }
  for (let y = Math.floor(minY / 100) * 100; y < maxY; y += 100) {
    ctx.moveTo(minX, y);
    ctx.lineTo(maxX, y);
  }
  ctx.stroke();

  // outside of the arena
  ctx.fillStyle = 'rgba(255,40,80,0.08)';
  ctx.beginPath();
  ctx.rect(minX, minY, maxX - minX, maxY - minY);
  ctx.arc(0, 0, ARENA, 0, Math.PI * 2, true);
  ctx.fill('evenodd');
  ctx.strokeStyle = 'rgba(255,60,100,0.85)';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(0, 0, ARENA, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,60,100,0.2)';
  ctx.lineWidth = 30;
  ctx.stroke();

  // food
  ctx.globalCompositeOperation = 'lighter';
  for (const f of foods) {
    if (f.x < minX || f.x > maxX || f.y < minY || f.y > maxY) continue;
    const pulse = 1 + 0.18 * Math.sin(time * 3 + f.phase);
    const size = f.r * 4.2 * pulse;
    const fade = f.life < 3 ? f.life / 3 : 1;
    ctx.globalAlpha = fade;
    ctx.drawImage(glowSprite(f.hue), f.x - size / 2, f.y - size / 2, size, size);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  // snakes (bigger ones on top, player last)
  const visible = snakes.filter((s) => s.alive && s.x > minX - 1500 && s.x < maxX + 1500 && s.y > minY - 1500 && s.y < maxY + 1500);
  visible.sort((a, b) => (a === player) - (b === player) || a.mass - b.mass);
  for (const s of visible) drawSnake(s);

  // names
  ctx.font = `600 ${13 / z}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  for (const s of visible) {
    if (s === player) continue;
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.fillText(s.name, s.x, s.y - s.r - 12 / z);
  }

  // particles
  ctx.globalCompositeOperation = 'lighter';
  for (const p of particles) {
    ctx.fillStyle = `hsla(${p.hue},100%,65%,${p.life / p.max})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';

  drawMinimap();
  updateHud();
}

function drawMinimap() {
  const s = mini.width;
  const scale = (s / 2 - 6 * dpr) / ARENA;
  mctx.setTransform(1, 0, 0, 1, 0, 0);
  mctx.clearRect(0, 0, s, s);
  mctx.fillStyle = 'rgba(10,14,30,0.75)';
  mctx.beginPath();
  mctx.arc(s / 2, s / 2, s / 2 - 2 * dpr, 0, Math.PI * 2);
  mctx.fill();
  mctx.strokeStyle = 'rgba(255,60,100,0.7)';
  mctx.lineWidth = 2 * dpr;
  mctx.stroke();
  const ranked = snakes.filter((x) => x.alive).sort((a, b) => b.mass - a.mass).slice(0, 6);
  for (const sn of ranked) {
    if (sn === player) continue;
    mctx.fillStyle = `hsla(${sn.hue},100%,65%,0.85)`;
    mctx.beginPath();
    mctx.arc(s / 2 + sn.x * scale, s / 2 + sn.y * scale, (2 + sn.r * 0.08) * dpr, 0, Math.PI * 2);
    mctx.fill();
  }
  if (player && player.alive) {
    mctx.fillStyle = '#fff';
    mctx.beginPath();
    mctx.arc(s / 2 + player.x * scale, s / 2 + player.y * scale, 3.5 * dpr, 0, Math.PI * 2);
    mctx.fill();
  }
}

/* ---------- HUD & screens ---------- */

const $ = (id) => document.getElementById(id);
let hudTick = 0;

function updateHud() {
  if (++hudTick % 10) return;
  if (player && state === 'play') {
    $('length').textContent = Math.floor(player.mass);
    $('kills').textContent = player.kills;
  }
  $('best').textContent = best;
  const ranked = snakes.filter((s) => s.alive).sort((a, b) => b.mass - a.mass);
  const top = ranked.slice(0, 8);
  const rows = top.map((s, i) => `<li class="${s === player ? 'me' : ''}"><span>${i + 1}</span><b></b><em>${Math.floor(s.mass)}</em></li>`);
  const myRank = player && player.alive ? ranked.indexOf(player) : -1;
  if (myRank >= 8) rows.push(`<li class="me"><span>${myRank + 1}</span><b></b><em>${Math.floor(player.mass)}</em></li>`);
  const list = $('board');
  list.innerHTML = rows.join('');
  // names via textContent (never HTML)
  const shown = myRank >= 8 ? [...top, player] : top;
  list.querySelectorAll('b').forEach((b, i) => (b.textContent = shown[i].name));
}

function startGame() {
  const nameInput = $('name');
  playerName = (nameInput.value || '').trim().slice(0, 14) || 'You';
  save('neon-coil:name', playerName);
  save('neon-coil:hue', playerHue);
  if (player) snakes = snakes.filter((s) => s !== player);
  player = createSnake({ name: playerName, hue: playerHue, mass: 20, bot: false });
  camera.x = player.x;
  camera.y = player.y;
  state = 'play';
  $('menu').hidden = true;
  $('dead').hidden = true;
  $('hud').hidden = false;
  canvas.focus();
}

function showDeath() {
  $('dead-title').textContent = deathInfo.killer ? `Swallowed by ${deathInfo.killer}` : 'You hit the wall';
  $('dead-length').textContent = deathInfo.mass;
  $('dead-kills').textContent = deathInfo.kills;
  $('dead-best').textContent = best;
  setTimeout(() => {
    if (state === 'dead') {
      $('dead').hidden = false;
      $('again').focus();
    }
  }, 700);
}

function buildMenu() {
  $('name').value = playerName;
  const sw = $('swatches');
  for (const h of HUES) {
    const b = document.createElement('button');
    b.className = 'swatch' + (h === playerHue ? ' on' : '');
    b.style.background = `hsl(${h},90%,58%)`;
    b.setAttribute('aria-label', 'Color');
    b.onclick = () => {
      playerHue = h;
      sw.querySelectorAll('.swatch').forEach((x) => x.classList.toggle('on', x === b));
    };
    sw.append(b);
  }
  $('play').onclick = startGame;
  $('again').onclick = startGame;
  $('name').addEventListener('keydown', (e) => e.key === 'Enter' && startGame());
}

/* ---------- Input ---------- */

canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch' && e.target !== canvas) return;
  pointer.x = e.clientX;
  pointer.y = e.clientY;
  pointer.active = true;
});
canvas.addEventListener('pointerdown', (e) => {
  pointer.x = e.clientX;
  pointer.y = e.clientY;
  pointer.active = true;
  if (e.pointerType === 'mouse') boostHeld = true;
});
addEventListener('pointerup', (e) => {
  if (e.pointerType === 'mouse') boostHeld = false;
});
const boostBtn = $('boost');
boostBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  e.stopPropagation();
  boostHeld = true;
  boostBtn.setPointerCapture?.(e.pointerId);
});
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) boostBtn.addEventListener(ev, () => (boostHeld = false));

addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code) && e.target.tagName !== 'INPUT') e.preventDefault();
  keys.add(e.code);
  if (e.code === 'Enter' && state === 'dead' && !$('dead').hidden) startGame();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => {
  keys.clear();
  boostHeld = false;
});

/* ---------- Loop ---------- */

for (let i = 0; i < FOOD_TARGET; i++) spawnNaturalFood();
for (let i = 0; i < BOT_COUNT; i++) spawnBot();
buildMenu();

let last = performance.now();
let acc = 0;
function frame(now) {
  acc += Math.min(0.1, (now - last) / 1000);
  last = now;
  let n = 0;
  while (acc >= STEP && n < 4) {
    update(STEP);
    acc -= STEP;
    n++;
  }
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
