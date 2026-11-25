// Flip Rider: stunt motocross. Vehicle tuning + 8 tracks.
// Tracks are written with the little track DSL in ../shared/physics.js (units: meters).

export const VEHICLE = {
  kind: 'bike',
  body: [
    { points: [[-0.55, -0.12], [0.5, -0.12], [0.72, 0.18], [0.05, 0.32], [-0.6, 0.22]] }, // frame + tank + seat
    { points: [[-0.32, 0.25], [-0.08, 0.25], [0.14, 0.82], [-0.1, 0.88]], density: 0.5 }, // rider
  ],
  density: 2.2,
  head: { x: 0.08, y: 1.04, r: 0.17 },
  wheels: [
    { x: -0.82, y: -0.36, drive: true },
    { x: 0.86, y: -0.36, axisX: -0.3 },
  ],
  wheelRadius: 0.42,
  wheelDensity: 1.0,
  wheelFriction: 1.4,
  hz: 4.5,
  damping: 0.6,
  torque: 13,
  maxSpeed: 42,
  reverseSpeed: 10,
  brakeTorque: 9,
  rolling: 0.25,
  holdTorque: 6,
  groundSpin: 1.6,
  groundGain: 0.035,
  wheelieLimit: 0.5,
  airSpin: 5.5,
  airGain: 0.06,
  comOffsetY: -0.35,
  angularDamping: 0.3,
  boostSpeed: 15,
  spawnHeight: 1.0,
  flipBonus: 2,
};

export const THEME = {
  sky: ['#0d0b24', '#3b1a5a', '#ff7a59'],
  far: '#2b1846',
  near: '#1f1236',
  ground: ['#2a1d40', '#140d22'],
  edge: '#ff9f6e',
  edgeWidth: 0.22,
  accent: '#ffd166',
  bike: '#ff4d4d',
};

export const LEVELS = [
  {
    name: 'Warm Up',
    stars: [16, 23],
    build: (t) =>
      t.flat(14).hills(2, 1.0, 14).flat(6)
        .kicker(6, 1.5).flat(1.5).curve(10, -1.5, 'out').flat(8)
        .checkpoint()
        .valley(12, 2).flat(4).bumps(4, 0.35, 3).flat(6)
        .kicker(7, 2.0).gap(5, -1.2).curve(8, -0.8, 'out').flat(6)
        .finish(),
  },
  {
    name: 'Hop Scotch',
    stars: [18, 26],
    build: (t) =>
      t.flat(16).kicker(6, 1.4).gap(5, -0.6).curve(14, -2.2, 'out').flat(10)
        .kicker(6, 1.6).gap(6, -0.6).curve(14, -2.4, 'out').flat(8)
        .checkpoint()
        .hills(2, 1.4, 12).flat(8)
        .kicker(7, 2.0).gap(8, -0.8).curve(16, -2.6, 'out').flat(10)
        .finish(),
  },
  {
    name: 'Crate Crash',
    stars: [17, 25],
    build: (t) =>
      t.flat(12).slope(6, 1).flat(3).crateWall(1, 1, 3, 0.6, 0.15).flat(3).curve(12, -3).flat(10)
        .hills(2, 1.2, 12).flat(5)
        .checkpoint()
        .flat(8).crateWall(3, 2, 3, 0.6, 0.15).flat(6).curve(10, -2).flat(10)
        .kicker(6, 1.6).gap(6, -1.6).flat(6).stairs(3, 2.5, -0.5).flat(8)
        .finish(),
  },
  {
    name: 'Seesaw Saloon',
    stars: [18, 27],
    build: (t) =>
      t.flat(12).seesaw(9, 1.0).flat(8).bridge(14, 0).flat(6)
        .checkpoint()
        .hills(2, 1.5, 14).flat(3).seesaw(10, 1.2).flat(6)
        .kicker(6, 1.6).gap(6, -1.2).flat(4).bridge(12, -1).flat(8)
        .finish(),
  },
  {
    name: 'Big Air',
    stars: [15, 22],
    build: (t) =>
      t.flat(8).curve(20, -6).flat(6)
        .kicker(9, 3.5).gap(14, -2).curve(14, -4, 'out').flat(8)
        .checkpoint()
        .curve(16, -4).flat(4).kicker(8, 3).gap(10, 0).curve(10, -3, 'out').flat(6)
        .finish(),
  },
  {
    name: 'Rollercoaster',
    stars: [25, 37],
    build: (t) =>
      t.flat(10).hills(3, 3, 22).flat(4).bumps(8, 0.4, 2.6).flat(6)
        .checkpoint()
        .hills(2, 4.5, 28).flat(4)
        .kicker(6, 2).gap(7, -2).curve(8, -1, 'out').bumps(6, 0.5, 3).flat(6)
        .finish(),
  },
  {
    name: 'Mesa Hopper',
    stars: [15, 21],
    build: (t) =>
      t.flat(10).boost(5).kicker(8, 1.6).gap(9, -0.4).flat(20)
        .boost(4).kicker(8, 1.6).gap(10, -0.6).flat(18)
        .checkpoint()
        .slope(10, -2).boost(5).kicker(8, 2).gap(11, -1).curve(14, -2, 'out').flat(10)
        .finish(),
  },
  {
    name: 'Spike Valley',
    stars: [15, 22],
    build: (t) =>
      t.flat(14).kicker(6, 1.8).flat(0.5).slope(1, -2.5).spikes(6).slope(1, 2.5).flat(8)
        .bumps(3, 0.4, 3).flat(4)
        .checkpoint()
        .boost(5).kicker(7, 2.2).flat(0.5).slope(1.2, -3).spikes(9).slope(1.2, 3).flat(6)
        .checkpoint()
        .hills(1, 2, 14).kicker(6, 1.6).gap(7.5, -1.6).curve(10, -0.8, 'out').flat(6)
        .finish(),
  },
];
