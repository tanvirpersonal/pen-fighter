// Central game configuration. Everything tunable lives here.

/** Default interface language. Change to 'bn' for Bangla-first. */
export const DEFAULT_LANG = 'en';
export const LANGS = ['en', 'bn'];

/** Desk (playable area) in world units, centred on the origin. */
export const DESK = { w: 900, h: 560 };

/** Pen body dimensions in world units. */
export const PEN_DIMS = { len: 120, wid: 12 };

/** Physics tuning. Matter.js is stepped at a fixed rate, independent of display refresh rate. */
export const PHYS = {
  step: 1000 / 60,
  frictionAir: 0.03,
  restitution: 0.55,
  friction: 0.05,
  positionIterations: 8,
  velocityIterations: 6,
  fallSteps: 120,
  settleSpeed: 0.08,
  settleAngular: 0.004,
  settleHoldSteps: 30,
  maxMoveSteps: 900,
};

/** Shot mapping. Pull distance (world units) -> power 0..1 -> launch speed (units / step). */
export const SHOT = { minPull: 14, maxPull: 150, minSpeed: 2.5, maxSpeed: 22 };

export function powerFromPull(pull) {
  if (!(pull >= SHOT.minPull)) return 0;
  return Math.min(1, (pull - SHOT.minPull) / (SHOT.maxPull - SHOT.minPull));
}
export function speedForPower(p) {
  const c = Math.max(0, Math.min(1, p));
  return SHOT.minSpeed + c * (SHOT.maxSpeed - SHOT.minSpeed);
}
export function powerForSpeed(v) {
  return Math.max(0, Math.min(1, (v - SHOT.minSpeed) / (SHOT.maxSpeed - SHOT.minSpeed)));
}
/** Approximate distance travelled by a free-sliding body launched at speed v. */
export function travelDistance(v) {
  return v / PHYS.frictionAir;
}

export const MODES = ['quick', 'ai', 'local', 'online', 'practice', 'custom'];
export const SERIES = [1, 3, 5];
export const SHOT_CLOCKS = [0, 10, 15, 20, 30];
export const AI_LEVELS = ['easy', 'medium', 'hard'];
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
export const NAME_MAX = 16;
export const QUALITIES = ['low', 'medium', 'high'];
export const CAMERA_MODES = ['auto', 'manual'];
export const VIEWS = ['2d', '3d'];

export const PLAYER_COLORS = ['#DC3545', '#3B82F6', '#22C55E', '#F59E0B', '#A855F7', '#06B6D4'];

export const THEME = {
  bg: '#080808',
  bg2: '#111114',
  accent: '#DC3545',
  text: '#F5F5F7',
  text2: '#A1A1AA',
  border: '#2A2A31',
};
