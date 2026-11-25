// Vehicle + level physics on top of planck.js (a Box2D port).
// No DOM code in here, so levels can be tested headlessly.
// Units are meters, kilograms, seconds; y points up.

const pl = () => globalThis.planck;
const V = (x, y) => pl().Vec2(x, y);

/* ========================================================================== */
/* Track builder: a tiny DSL for writing levels                                 */
/* ========================================================================== */

export function track(x0 = 0, y0 = 0) {
  const t = {
    x: x0,
    y: y0,
    // back wall so you can't drive off the start
    chains: [[[x0 - 25, y0 + 40], [x0 - 25, y0], [x0, y0]]],
    objects: [],
    checkpoints: [],
    finishX: null,
    get cur() {
      return this.chains[this.chains.length - 1];
    },
    to(x, y) {
      const last = this.cur[this.cur.length - 1];
      if (!last || Math.hypot(last[0] - x, last[1] - y) > 0.01) this.cur.push([x, y]);
      this.x = x;
      this.y = y;
      return this;
    },
    flat(len) {
      return this.to(this.x + len, this.y);
    },
    slope(len, dy) {
      return this.to(this.x + len, this.y + dy);
    },
    /** Smooth curve. ease: 'inout' (S-curve), 'in' (gets steeper: launch ramp), 'out' (flattens: landing) */
    curve(len, dy, ease = 'inout', n = 0) {
      const steps = n || Math.max(6, Math.round(len * 1.2));
      const sx = this.x;
      const sy = this.y;
      for (let i = 1; i <= steps; i++) {
        const k = i / steps;
        const e = ease === 'in' ? k * k : ease === 'out' ? 1 - (1 - k) * (1 - k) : (1 - Math.cos(Math.PI * k)) / 2;
        this.to(sx + len * k, sy + dy * e);
      }
      return this;
    },
    kicker(len, h) {
      return this.curve(len, h, 'in');
    },
    hills(count, amp, wavelength) {
      for (let i = 0; i < count; i++) this.curve(wavelength / 2, amp).curve(wavelength / 2, -amp);
      return this;
    },
    bumps(count, amp, wavelength = 3) {
      return this.hills(count, amp, wavelength);
    },
    /** A dip you can drive through. */
    valley(len, depth) {
      return this.curve(len / 2, -depth).curve(len / 2, depth);
    },
    /** Steps going up (h>0) or down (h<0). Each riser has a short bevel so wheels can climb. */
    stairs(n, w, h) {
      for (let i = 0; i < n; i++) this.to(this.x + Math.abs(h) * 0.35, this.y + h).flat(w);
      return this;
    },
    /** A hole. The ground stops and starts again `len` meters later (dy = height change). */
    gap(len, dy = 0) {
      this.x += len;
      this.y += dy;
      this.chains.push([[this.x, this.y]]);
      return this;
    },
    /** A wobbly plank bridge across a gap. */
    bridge(len, dy = 0) {
      const x1 = this.x + len;
      const y1 = this.y + dy;
      this.objects.push({ type: 'bridge', x0: this.x, y0: this.y, x1, y1, n: Math.max(4, Math.round(len / 0.9)) });
      this.chains.push([[x1, y1]]);
      this.x = x1;
      this.y = y1;
      return this;
    },
    seesaw(len = 9, height = 1) {
      this.objects.push({ type: 'seesaw', x: this.x + len / 2, y: this.y + height, len, h: height });
      return this.flat(len);
    },
    crates(dx, count = 1, size = 1, density = 0.3) {
      for (let i = 0; i < count; i++) this.objects.push({ type: 'crate', x: this.x + dx, y: this.y + size / 2 + i * size + 0.02, size, density });
      return this;
    },
    crateWall(dx, cols, rows, size = 0.8, density = 0.3) {
      for (let c = 0; c < cols; c++)
        for (let r = 0; r < rows; r++)
          this.objects.push({ type: 'crate', x: this.x + dx + c * (size + 0.02), y: this.y + size / 2 + r * size + 0.02, size, density });
      return this;
    },
    boulder(dx, r = 0.8, density = 0.6) {
      this.objects.push({ type: 'boulder', x: this.x + dx, y: this.y + r + 0.05, r, density });
      return this;
    },
    platform(dx, dy, w, angle = 0) {
      this.objects.push({ type: 'platform', x: this.x + dx, y: this.y + dy, w, angle });
      return this;
    },
    /** Kinematic platform that moves back and forth by (mx, my) meters. */
    mover(dx, dy, w, mx, my, period = 10, hold = 0.2) {
      this.objects.push({ type: 'mover', x: this.x + dx, y: this.y + dy, w, mx, my, period, hold });
      return this;
    },
    spikes(len) {
      this.objects.push({ type: 'spikes', x0: this.x, x1: this.x + len, y: this.y });
      return this.flat(len);
    },
    boost(len, power = 1) {
      this.objects.push({ type: 'boost', x0: this.x, x1: this.x + len, y: this.y, power });
      return this.flat(len);
    },
    checkpoint() {
      this.checkpoints.push({ x: this.x + 1.5, y: this.y });
      this.objects.push({ type: 'flag', x: this.x + 1.5, y: this.y, kind: 'checkpoint' });
      return this;
    },
    finish(runout = 30) {
      this.finishX = this.x + 2;
      this.objects.push({ type: 'flag', x: this.finishX, y: this.y, kind: 'finish' });
      this.flat(runout);
      return this.to(this.x, this.y + 40);
    },
  };
  return t;
}

/* ========================================================================== */
/* World                                                                       */
/* ========================================================================== */

export function buildLevel(level, gravity = 10) {
  const P = pl();
  const world = new P.World({ gravity: V(0, -gravity) });
  const t = track(0, 0);
  level.build(t);
  if (t.finishX == null) t.finish();

  const ground = world.createBody();
  let minY = Infinity;
  for (const chain of t.chains) {
    if (chain.length < 2) continue;
    for (const [, y] of chain) minY = Math.min(minY, y);
    const f = ground.createFixture(new P.Chain(chain.map(([x, y]) => V(x, y)), false), { friction: 0.9 });
    f.setUserData('ground');
  }

  const dynamic = [];
  const movers = [];
  const zones = [];
  for (const o of t.objects) {
    if (o.type === 'crate') {
      const b = world.createDynamicBody({ position: V(o.x, o.y) });
      b.createFixture(new P.Box(o.size / 2, o.size / 2), { density: o.density, friction: 0.7 }).setUserData('crate');
      dynamic.push({ type: 'crate', body: b, size: o.size });
    } else if (o.type === 'boulder') {
      const b = world.createDynamicBody({ position: V(o.x, o.y), angularDamping: 0.05 });
      b.createFixture(new P.Circle(o.r), { density: o.density, friction: 0.9, restitution: 0.1 }).setUserData('boulder');
      dynamic.push({ type: 'boulder', body: b, r: o.r });
    } else if (o.type === 'platform') {
      const b = world.createBody({ position: V(o.x, o.y), angle: o.angle || 0 });
      b.createFixture(new P.Box(o.w / 2, 0.25), { friction: 0.9 }).setUserData('ground');
      dynamic.push({ type: 'platform', body: b, w: o.w });
      minY = Math.min(minY, o.y);
    } else if (o.type === 'mover') {
      const b = world.createKinematicBody({ position: V(o.x, o.y) });
      b.createFixture(new P.Box(o.w / 2, 0.25), { friction: 1 }).setUserData('ground');
      movers.push({ body: b, o, t: 0 });
      dynamic.push({ type: 'platform', body: b, w: o.w, moving: true });
    } else if (o.type === 'seesaw') {
      // Static triangle from the ground up to the pivot point.
      const base = world.createBody({ position: V(o.x, o.y) });
      base.createFixture(new P.Polygon([V(-0.7, -o.h), V(0.7, -o.h), V(0, -0.05)]), { friction: 0.8 }).setUserData('ground');
      dynamic.push({ type: 'pivot', body: base, h: o.h });
      const tilt = Math.asin(Math.min(0.9, (o.h - 0.05) / (o.len / 2)));
      const plank = world.createDynamicBody({ position: V(o.x, o.y), angle: tilt });
      plank.createFixture(new P.Box(o.len / 2, 0.13), { density: 0.8, friction: 0.95 }).setUserData('ground');
      world.createJoint(new P.RevoluteJoint({ enableLimit: true, lowerAngle: -tilt - 0.02, upperAngle: tilt + 0.02 }, base, plank, V(o.x, o.y)));
      dynamic.push({ type: 'plank', body: plank, len: o.len, pivot: { x: o.x, y: o.y } });
    } else if (o.type === 'bridge') {
      const n = o.n;
      const dx = (o.x1 - o.x0) / n;
      const dy = (o.y1 - o.y0) / n;
      const len = Math.hypot(dx, dy);
      const ang = Math.atan2(dy, dx);
      let prev = ground;
      for (let i = 0; i < n; i++) {
        const cx = o.x0 + dx * (i + 0.5);
        const cy = o.y0 + dy * (i + 0.5) - 0.1;
        const plank = world.createDynamicBody({ position: V(cx, cy), angle: ang });
        plank.createFixture(new P.Box(len / 2, 0.1), { density: 1.2, friction: 0.95 }).setUserData('ground');
        world.createJoint(new P.RevoluteJoint({}, prev, plank, V(o.x0 + dx * i, o.y0 + dy * i - 0.1)));
        dynamic.push({ type: 'plank', body: plank, len });
        prev = plank;
      }
      world.createJoint(new P.RevoluteJoint({}, prev, ground, V(o.x1, o.y1 - 0.1)));
    } else if (o.type === 'spikes') {
      const b = world.createBody();
      const n = Math.max(1, Math.round((o.x1 - o.x0) / 0.6));
      const w = (o.x1 - o.x0) / n;
      for (let i = 0; i < n; i++) {
        const x = o.x0 + i * w;
        b.createFixture(new P.Polygon([V(x, o.y), V(x + w, o.y), V(x + w / 2, o.y + 0.55)]), { friction: 0.5 }).setUserData('spike');
      }
      zones.push(o);
    } else if (o.type === 'boost' || o.type === 'flag') {
      zones.push(o);
    }
  }

  // Crates smash when something hits them hard (keeps tracks from jamming up).
  const broken = new Set();
  world.on('post-solve', (contact, impulse) => {
    const fa = contact.getFixtureA();
    const fb = contact.getFixtureB();
    const imps = impulse.normalImpulses;
    const hit = Math.max(imps[0] || 0, imps[1] || 0);
    for (const [f, other] of [[fa, fb], [fb, fa]]) {
      if (f.getUserData() !== 'crate') continue;
      const body = f.getBody();
      const dv = hit / body.getMass();
      const byVehicle = other.getFilterGroupIndex() === -1;
      if (dv > (byVehicle ? 3.5 : 7)) broken.add(body);
    }
  });

  return {
    world,
    broken,
    track: t,
    dynamic,
    movers,
    zones,
    killY: minY - 12,
    finishX: t.finishX,
    checkpoints: t.checkpoints,
    start: { x: 3, y: 0 },
  };
}

/* ========================================================================== */
/* Vehicles                                                                     */
/* ========================================================================== */

export function createVehicle(world, spec, x, y) {
  const P = pl();
  const chassis = world.createDynamicBody({ position: V(x, y), angularDamping: spec.angularDamping ?? 0.4 });
  for (const poly of spec.body) {
    chassis.createFixture(new P.Polygon(poly.points.map(([px, py]) => V(px, py))), {
      density: poly.density ?? spec.density,
      friction: 0.6,
      filterGroupIndex: -1,
    });
  }
  const head = chassis.createFixture(new P.Circle(V(spec.head.x, spec.head.y), spec.head.r), { isSensor: true, filterGroupIndex: -1 });
  head.setUserData('head');
  if (spec.comOffsetY) {
    // Lower the centre of mass for arcade-style stability (keeps inertia consistent).
    const md = { mass: 0, center: V(0, 0), I: 0 };
    chassis.getMassData(md);
    const iCom = md.I - md.mass * (md.center.x * md.center.x + md.center.y * md.center.y);
    const c = V(md.center.x, md.center.y + spec.comOffsetY);
    chassis.setMassData({ mass: md.mass, center: c, I: iCom + md.mass * (c.x * c.x + c.y * c.y) });
  }

  const wheels = spec.wheels.map((w) => {
    const ax = w.axisX ?? 0;
    const axisLen = Math.hypot(ax, 1);
    const body = world.createDynamicBody({ position: V(x + w.x, y + w.y), angularDamping: 0.05 });
    body.createFixture(new P.Circle(w.r ?? spec.wheelRadius), {
      density: spec.wheelDensity,
      friction: spec.wheelFriction,
      restitution: 0.05,
      filterGroupIndex: -1,
    });
    const joint = world.createJoint(
      new P.WheelJoint(
        { enableMotor: true, maxMotorTorque: spec.rolling, motorSpeed: 0, frequencyHz: spec.hz, dampingRatio: spec.damping },
        chassis,
        body,
        body.getPosition(),
        V(ax / axisLen, 1 / axisLen),
      ),
    );
    return { body, joint, drive: Boolean(w.drive), r: w.r ?? spec.wheelRadius, local: { x: w.x, y: w.y } };
  });

  return { spec, chassis, head, wheels, grounded: false };
}

export function destroyVehicle(world, v) {
  if (!v) return;
  for (const w of v.wheels) world.destroyBody(w.body);
  world.destroyBody(v.chassis);
}

function touchingSolid(body) {
  for (let ce = body.getContactList(); ce; ce = ce.next) {
    const c = ce.contact;
    if (c.isTouching() && !c.getFixtureA().isSensor() && !c.getFixtureB().isSensor()) return true;
  }
  return false;
}

/** True if the rider's head / truck's roof is touching anything solid. */
export function headHit(v) {
  for (let ce = v.chassis.getContactList(); ce; ce = ce.next) {
    const c = ce.contact;
    if (!c.isTouching()) continue;
    const a = c.getFixtureA();
    const b = c.getFixtureB();
    const other = a === v.head ? b : b === v.head ? a : null;
    if (other && !other.isSensor()) return true;
  }
  return false;
}

export function touchingSpikes(v) {
  for (const body of [v.chassis, ...v.wheels.map((w) => w.body)]) {
    for (let ce = body.getContactList(); ce; ce = ce.next) {
      const c = ce.contact;
      if (!c.isTouching()) continue;
      if (c.getFixtureA().getUserData() === 'spike' || c.getFixtureB().getUserData() === 'spike') return true;
    }
  }
  return false;
}

/**
 * Apply controls for one physics step.
 * input: { gas: bool, brake: bool }
 */
export function driveVehicle(v, input, dt, slope = 0) {
  const s = v.spec;
  const angle = v.chassis.getAngle();
  // Pitch relative to the ground under the vehicle, wrapped to -PI..PI
  let pitch = angle - slope;
  pitch = Math.atan2(Math.sin(pitch), Math.cos(pitch));
  const vel = v.chassis.getLinearVelocity();
  const forward = vel.x * Math.cos(angle) + vel.y * Math.sin(angle);
  v.grounded = v.wheels.some((w) => touchingSolid(w.body));
  v.airTime = v.grounded ? 0 : (v.airTime || 0) + dt;
  v.speed = forward;
  // How fast the wheels roll relative to the vehicle (works on moving platforms too).
  const chassisSpin = v.chassis.getAngularVelocity();
  const driveWheel = v.wheels.find((w) => w.drive) || v.wheels[0];
  const rolling = -(driveWheel.body.getAngularVelocity() - chassisSpin) * driveWheel.r;

  for (const w of v.wheels) {
    const j = w.joint;
    if (input.gas && w.drive) {
      // Traction control: ease off when the nose lifts too far, so holding gas doesn't loop you out.
      const over = v.grounded ? Math.max(0, pitch - s.wheelieLimit) : 0;
      // Already faster than the engine's top speed (boost pad, downhill)? Freewheel instead of braking.
      const freewheel = rolling > s.maxSpeed * w.r * 0.98;
      j.setMotorSpeed(-s.maxSpeed);
      j.setMaxMotorTorque(freewheel ? s.rolling : s.torque * Math.max(0.35, 1 - over * 2));
    } else if (input.brake) {
      if (rolling > 1) {
        j.setMotorSpeed(0);
        j.setMaxMotorTorque(s.brakeTorque);
      } else if (w.drive) {
        j.setMotorSpeed(s.reverseSpeed);
        j.setMaxMotorTorque(s.torque * 0.7);
      } else {
        j.setMotorSpeed(0);
        j.setMaxMotorTorque(s.rolling);
      }
    } else {
      j.setMotorSpeed(0);
      j.setMaxMotorTorque(Math.abs(rolling) < 1.2 && v.grounded ? s.holdTorque ?? s.brakeTorque : s.rolling);
    }
  }

  // Arcade stability on the ground: gently pull the nose back toward the slope.
  if (v.grounded && Math.abs(pitch) > s.wheelieLimit) {
    const excess = pitch - Math.sign(pitch) * s.wheelieLimit;
    const target = -excess * 4;
    const w = v.chassis.getAngularVelocity();
    v.chassis.applyAngularImpulse((target - w) * 0.15 * v.chassis.getInertia() * dt * 60, true);
  }

  // Lean / spin control: gas tips the nose up (backflip), brake tips it down (frontflip).
  const dir = (input.gas ? 1 : 0) - (input.brake ? 1 : 0);
  // On the ground only the brake leans (nose down); gas lean is for the air.
  // (air control waits a moment so small hops don't twist you)
  if (dir !== 0 && !(v.grounded && dir > 0) && (v.grounded || v.airTime > 0.15)) {
    const target = dir * (v.grounded ? s.groundSpin : s.airSpin);
    const w = v.chassis.getAngularVelocity();
    if ((dir > 0 && w < target) || (dir < 0 && w > target)) {
      const gain = v.grounded ? s.groundGain : s.airGain;
      v.chassis.applyAngularImpulse((target - w) * gain * v.chassis.getInertia() * dt * 60, true);
    }
  }
}

/** Boost pads + moving platforms. Call once per step before world.step(). */
export function updateLevel(level, v, dt) {
  for (const m of level.movers) {
    // Move toward where the platform should be next step (no drift), pausing at both ends.
    m.t += dt;
    const f = moverFraction(m.t, m.o.period, m.o.hold ?? 0.2);
    const p = m.body.getPosition();
    const tx = m.o.x + m.o.mx * f;
    const ty = m.o.y + m.o.my * f;
    m.body.setLinearVelocity(V((tx - p.x) / dt, (ty - p.y) / dt));
  }
  if (!v) return;
  const p = v.chassis.getPosition();
  for (const z of level.zones) {
    if (z.type !== 'boost' || p.x < z.x0 || p.x > z.x1 || !v.grounded) continue;
    const target = (v.spec.boostSpeed || 16) * z.power;
    if (v.speed < target) {
      const a = v.chassis.getAngle();
      const mass = v.chassis.getMass() + v.wheels.reduce((s, w) => s + w.body.getMass(), 0);
      const imp = Math.min(target - v.speed, 30 * dt) * mass;
      v.chassis.applyLinearImpulse(V(Math.cos(a) * imp, Math.sin(a) * imp), v.chassis.getWorldCenter(), true);
    }
  }
}

/** Remove crates that broke during the last step. Returns their positions for debris effects. */
export function sweepBroken(level) {
  if (!level.broken.size) return [];
  const out = [];
  for (const body of level.broken) {
    const p = body.getPosition();
    const item = level.dynamic.find((d) => d.body === body);
    out.push({ x: p.x, y: p.y, size: item?.size || 0.6, angle: body.getAngle() });
    level.world.destroyBody(body);
    level.dynamic = level.dynamic.filter((d) => d.body !== body);
  }
  level.broken.clear();
  return out;
}

/** 0..1 position along a mover's path: hold, ease over, hold, ease back. */
export function moverFraction(t, period, hold) {
  const ph = (t % period) / period;
  const move = 0.5 - hold;
  if (ph < hold) return 0;
  if (ph < 0.5) return (1 - Math.cos((Math.PI * (ph - hold)) / move)) / 2;
  if (ph < 0.5 + hold) return 1;
  return (1 + Math.cos((Math.PI * (ph - 0.5 - hold)) / move)) / 2;
}

/** Approximate slope angle of the track at x (ignores moving objects). */
export function slopeAt(level, x) {
  return Math.atan2(groundY(level, x + 0.8) - groundY(level, x - 0.8), 1.6);
}

/** Ground height at x (top-most chain point), used for respawn positions. */
export function groundY(level, x) {
  let best = -Infinity;
  for (const chain of level.track.chains) {
    for (let i = 1; i < chain.length; i++) {
      const [x0, y0] = chain[i - 1];
      const [x1, y1] = chain[i];
      if (x1 === x0 || x < Math.min(x0, x1) || x > Math.max(x0, x1)) continue;
      const y = y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
      best = Math.max(best, y);
    }
  }
  return best === -Infinity ? 0 : best;
}
