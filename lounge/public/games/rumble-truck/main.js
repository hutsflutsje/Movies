import { startGame } from '../shared/vehicle-game.js';
import { LEVELS, THEME, VEHICLE } from './levels.js';

startGame({
  id: 'rumble-truck',
  title: 'Rumble Truck',
  tagline: "Monster-truck obstacle courses. Crush crates, cross bridges, don't flip!",
  VEHICLE,
  THEME,
  LEVELS,
});
