import { startGame } from '../shared/vehicle-game.js';
import { LEVELS, THEME, VEHICLE } from './levels.js';

startGame({
  id: 'flip-rider',
  title: 'Flip Rider',
  tagline: 'Stunt motocross. Land flips to shave seconds off your time.',
  VEHICLE,
  THEME,
  LEVELS,
});
