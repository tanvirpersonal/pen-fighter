// AI shot selection. Pure function of a physics snapshot: the AI sees only pen positions (the same
// information a human sees) and returns an ordinary (angle, power) shot that goes through the same
// GameSession.shoot() validation as human input. It never touches physics directly.

import { DESK, PEN_DIMS, PHYS, powerForSpeed, travelDistance } from '../config/constants.js';
import { gaussian } from '../game/rng.js';

const HALF_W = DESK.w / 2;
const HALF_H = DESK.h / 2;

export const AI_PROFILES = {
  easy: { angleNoise: 0.28, overshoot: 260, powerNoise: 0.25, mistake: 0.18, think: [900, 1700] },
  medium: { angleNoise: 0.1, overshoot: 180, powerNoise: 0.1, mistake: 0.04, think: [700, 1300] },
  hard: { angleNoise: 0.025, overshoot: 90, powerNoise: 0.04, mistake: 0, think: [600, 1100] },
};

/** Distance from a point to the nearest desk edge (negative if outside). */
export function edgeDistance(x, y) {
  return Math.min(HALF_W - Math.abs(x), HALF_H - Math.abs(y));
}

/** Distance along a ray from (x,y) in direction `angle` until it leaves the desk. */
export function rayToEdge(x, y, angle) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let t = Infinity;
  if (dx > 1e-9) t = Math.min(t, (HALF_W - x) / dx);
  else if (dx < -1e-9) t = Math.min(t, (-HALF_W - x) / dx);
  if (dy > 1e-9) t = Math.min(t, (HALF_H - y) / dy);
  else if (dy < -1e-9) t = Math.min(t, (-HALF_H - y) / dy);
  return Math.max(0, t);
}

function normAngle(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

export function thinkTime(level, rng) {
  const [lo, hi] = (AI_PROFILES[level] || AI_PROFILES.medium).think;
  return lo + rng() * (hi - lo);
}

/**
 * @param {{pens: Array<{id:string,x:number,y:number,out:boolean}>}} snap
 * @param {string} selfId
 * @param {string[]} targetIds ids of opposing pens
 * @param {'easy'|'medium'|'hard'} level
 * @param {() => number} rng
 * @returns {{angle: number, power: number}}
 */
export function chooseShot(snap, selfId, targetIds, level, rng) {
  const prof = AI_PROFILES[level] || AI_PROFILES.medium;
  const me = snap.pens.find((p) => p.id === selfId && !p.out);
  const foes = snap.pens.filter((p) => targetIds.includes(p.id) && !p.out);
  if (!me || foes.length === 0) return { angle: normAngle((rng() - 0.5) * 2 * Math.PI), power: 0.3 };

  // 1. Pick a target.
  let best = null;
  let bestScore = -Infinity;
  for (const f of foes) {
    const dx = f.x - me.x;
    const dy = f.y - me.y;
    const dist = Math.hypot(dx, dy) || 1;
    let score;
    if (level === 'easy') {
      score = -dist + rng() * 320;
    } else if (level === 'medium') {
      score = -dist;
    } else {
      // Hard: prefer foes close to an edge that I would push further outward, and that are reachable.
      const edge = edgeDistance(f.x, f.y);
      const outward = Math.atan2(f.y, f.x); // direction from desk centre to the foe
      const alignment = Math.cos(normAngle(Math.atan2(dy, dx) - outward));
      score = -dist * 0.55 + (260 - Math.min(edge, 260)) * 1.1 + alignment * 140;
    }
    if (score > bestScore) { bestScore = score; best = { f, dx, dy, dist }; }
  }

  // 2. Aim, with skill-dependent error.
  let angle = Math.atan2(best.dy, best.dx) + gaussian(rng) * prof.angleNoise;
  let mistake = false;
  if (prof.mistake > 0 && rng() < prof.mistake) {
    mistake = true;
    angle += (rng() - 0.5) * 2.0;
  }

  // 3. Choose power so the pen travels roughly to (and slightly beyond) the target.
  const wanted = best.dist + prof.overshoot;
  let speed = (wanted * PHYS.frictionAir);
  if (level === 'hard') {
    // Never slide off the desk myself: cap travel at the distance to the edge along the shot line.
    const room = rayToEdge(me.x, me.y, angle) - PEN_DIMS.wid - 12;
    const cap = Math.max(60, Math.min(room, best.dist + 140));
    speed = Math.min(speed, cap * PHYS.frictionAir);
  }
  let power = powerForSpeed(speed) + gaussian(rng) * prof.powerNoise;
  if (mistake) power = 0.2 + rng() * 0.8;
  // Easy/medium never fire weaker than a nudge; hard may use the weakest legal shot to stay on the desk.
  power = Math.max(level === 'hard' ? 0 : 0.22, Math.min(1, power));
  return { angle: normAngle(angle), power: Math.round(power * 1000) / 1000 };
}

export { travelDistance };
