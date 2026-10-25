// Pure arena layout: where pens and desk objects start. No physics engine needed.
// The same layout feeds the Matter.js world, the test physics stand-in, and the renderers.

import { DESK } from '../config/constants.js';
import { makeRng, randRange } from '../game/rng.js';

/** Evenly spaced start positions around the desk, every pen facing the centre. */
export function ringSpawns(count) {
  const rx = DESK.w / 2 - 110;
  const ry = DESK.h / 2 - 90;
  const out = [];
  for (let i = 0; i < count; i++) {
    const t = Math.PI + (i * 2 * Math.PI) / count;
    const x = Math.cos(t) * rx;
    const y = Math.sin(t) * ry;
    out.push({ x: round2(x), y: round2(y), a: round3(Math.atan2(-y, -x)) });
  }
  return out;
}

/** Fixed practice layout: the human on the left, soft targets nearer the centre. */
export function practiceSpawns(dummyCount) {
  const targets = [
    { x: 120, y: -90, a: 0.4 },
    { x: 190, y: 100, a: -0.6 },
    { x: 40, y: 150, a: 1.2 },
  ];
  return [{ x: -340, y: 0, a: 0 }, ...targets.slice(0, dummyCount)];
}

/** Desk objects: an eraser, a sharpener and coins, lightly jittered by a seeded RNG. */
export function objectLayout(seed) {
  const rng = makeRng(seed);
  const j = (n) => randRange(rng, -n, n);
  return [
    { id: 'eraser', kind: 'eraser', x: round2(-40 + j(20)), y: round2(-30 + j(15)), a: round3(j(0.6)) },
    { id: 'sharpener', kind: 'sharpener', x: round2(90 + j(20)), y: round2(55 + j(15)), a: round3(j(0.8)) },
    { id: 'coin1', kind: 'coin', x: round2(-120 + j(15)), y: round2(70 + j(10)), a: 0 },
    { id: 'coin2', kind: 'coin', x: round2(150 + j(15)), y: round2(-70 + j(10)), a: 0 },
    { id: 'coin3', kind: 'coin', x: round2(10 + j(15)), y: round2(88 + j(6)), a: 0 },
  ];
}

/**
 * Builds the full spec handed to a physics world.
 * @param {Array<{id:string,type:string}>} penPlayers players that get a pen, in seat order
 * @param {number} seed
 * @param {boolean} practice
 */
export function buildArena(penPlayers, seed, practice = false) {
  let spawns;
  if (practice) {
    const dummies = penPlayers.filter((p) => p.type === 'dummy').length;
    spawns = practiceSpawns(dummies);
  } else {
    spawns = ringSpawns(penPlayers.length);
  }
  // Practice puts the human first; competitive uses seat order directly.
  const ordered = practice
    ? [...penPlayers.filter((p) => p.type !== 'dummy'), ...penPlayers.filter((p) => p.type === 'dummy')]
    : penPlayers;
  const pens = ordered.map((p, i) => ({ id: p.id, ...spawns[i] }));
  return { pens, objects: objectLayout(seed) };
}

function round2(n) { return Math.round(n * 100) / 100; }
function round3(n) { return Math.round(n * 1000) / 1000; }
