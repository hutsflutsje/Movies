// Rumble Truck: monster-truck obstacle courses. Vehicle tuning + 8 levels.
// Levels are written with the track DSL in ../shared/physics.js (units: meters).

export const VEHICLE = {
  kind: 'truck',
  body: [
    { points: [[-1.45, -0.25], [1.45, -0.25], [1.5, 0.2], [-1.5, 0.25]] }, // chassis + bed
    { points: [[-0.35, 0.2], [0.75, 0.2], [0.55, 0.85], [-0.25, 0.85]], density: 0.6 }, // cab
  ],
  density: 1.0,
  head: { x: 0.15, y: 0.95, r: 0.24 },
  wheels: [
    { x: -1.05, y: -0.55, drive: true },
    { x: 1.05, y: -0.55, drive: true },
  ],
  wheelRadius: 0.55,
  wheelDensity: 0.8,
  wheelFriction: 1.6,
  hz: 3.5,
  damping: 0.55,
  torque: 12,
  maxSpeed: 26,
  reverseSpeed: 12,
  brakeTorque: 10,
  rolling: 0.5,
  holdTorque: 8,
  groundSpin: 0.8,
  groundGain: 0.02,
  wheelieLimit: 0.6,
  airSpin: 3.2,
  airGain: 0.05,
  comOffsetY: -0.3,
  angularDamping: 0.4,
  boostSpeed: 16,
  spawnHeight: 1.35,
  flipBonus: 1.5,
};

export const THEME = {
  sky: ['#4cc9f0', '#a5e6ff', '#ffe8b0'],
  far: '#e9a65b',
  near: '#c9783c',
  ground: ['#b9773a', '#6d3f1d'],
  edge: '#ffd27a',
  edgeWidth: 0.28,
  accent: '#ffffff',
  truck: '#2563eb',
};

export const LEVELS = [
  {
    name: 'Dirt Road',
    stars: [14, 21],
    build: (t) =>
      t.flat(14).hills(2, 1.2, 14).flat(6).crates(3, 1, 1).flat(8)
        .checkpoint()
        .valley(14, 2.5).flat(4).kicker(6, 1.2).flat(2).curve(8, -1.2, 'out').bumps(5, 0.3, 3).flat(6)
        .finish(),
  },
  {
    name: 'Steep Street',
    stars: [22, 32],
    build: (t) =>
      t.flat(12).curve(14, 4).flat(6).curve(12, -2).stairs(4, 3, 0.6).flat(6)
        .checkpoint()
        .curve(16, 6).flat(5).curve(10, -4).flat(4).curve(10, 3, 'in').flat(4).curve(14, -5, 'out').flat(8)
        .finish(),
  },
  {
    name: 'Crate Pile',
    stars: [9, 13],
    build: (t) =>
      t.flat(12).crateWall(4, 2, 3, 0.55).flat(14).crateWall(3, 3, 2, 0.55).flat(12)
        .checkpoint()
        .slope(6, 1.5).flat(4).crateWall(2, 3, 3, 0.5).flat(12).slope(6, -1.5).flat(6)
        .finish(),
  },
  {
    name: 'Rickety Bridges',
    stars: [15, 22],
    build: (t) =>
      t.flat(12).bridge(16, 0).flat(6).bridge(14, -1).flat(6)
        .checkpoint()
        .slope(4, 1).bridge(20, 0).flat(5).bridge(10, 1).flat(8)
        .finish(),
  },
  {
    name: 'Seesaw Shuffle',
    stars: [15, 22],
    build: (t) =>
      t.flat(12).seesaw(10, 1.2).flat(6).seesaw(10, 1.2).flat(6)
        .checkpoint()
        .slope(5, 1.5).seesaw(12, 1.5).slope(5, -1.5).flat(6).kicker(6, 1.2).gap(4, -1.2).flat(8)
        .finish(),
  },
  {
    name: 'Going Up',
    stars: [32, 47],
    build: (t) =>
      t.flat(10).mover(5.25, -0.25, 10, 0, 3, 10).gap(10.5, 3).flat(10)
        .checkpoint()
        .flat(2).mover(4.25, -0.25, 8, 11.5, 0, 14).gap(20, 0).flat(10)
        .finish(),
  },
  {
    name: 'Rock Garden',
    stars: [20, 29],
    build: (t) =>
      t.flat(10).bumps(6, 0.45, 2.4).flat(4).stairs(3, 2.4, 0.5).flat(3).curve(8, -1.5).flat(4)
        .checkpoint()
        .bumps(5, 0.6, 2.8).flat(3).curve(8, 2.5, 'in').flat(1).curve(10, -2.5, 'out').flat(3)
        .boulder(3, 0.55, 0.3).boulder(5, 0.55, 0.3).flat(8).curve(12, -3).bumps(3, 0.4, 3).flat(6)
        .finish(),
  },
  {
    name: 'Grand Canyon',
    stars: [15, 22],
    build: (t) =>
      t.flat(12).boost(8, 1.1).kicker(7, 2.2).gap(12, -1.5).curve(8, -1, 'out').flat(6)
        .checkpoint()
        .bridge(14, 0).flat(4).seesaw(10, 1.2).flat(4)
        .boost(6, 1.1).kicker(7, 2.4).gap(14, -2).curve(10, -1, 'out').flat(6)
        .finish(),
  },
];
