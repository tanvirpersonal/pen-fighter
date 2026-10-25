// Minimal stand-in for PhysicsWorld, used only by tests. It implements the same interface with
// simple deterministic kinematics (linear damping, desk-edge elimination, and a crude pen-pen
// momentum hand-off), so match-flow logic can be tested without installing Matter.js.

import { DESK, PHYS, speedForPower } from '../../src/config/constants.js';

export class FakePhysics {
  constructor() { this.entries = new Map(); this.settledSteps = 0; this.stepsMoving = 0; this.script = []; }

  reset(spec) {
    this.entries.clear();
    this.settledSteps = 0;
    this.stepsMoving = 0;
    for (const p of spec.pens) this.entries.set(p.id, { id: p.id, kind: 'pen', x: p.x, y: p.y, a: p.a || 0, vx: 0, vy: 0, out: false, fall: 0 });
    for (const o of spec.objects) this.entries.set(o.id, { id: o.id, kind: o.kind, x: o.x, y: o.y, a: o.a || 0, vx: 0, vy: 0, out: false, fall: 0 });
    this.spec = spec;
  }

  shoot(id, angle, power) {
    const e = this.entries.get(id);
    if (!e || e.kind !== 'pen' || e.out) return false;
    const v = speedForPower(power);
    e.vx = Math.cos(angle) * v; e.vy = Math.sin(angle) * v;
    this.settledSteps = 0; this.stepsMoving = 0;
    return true;
  }

  /** Test helper: give any entry a velocity directly. */
  kick(id, vx, vy) { const e = this.entries.get(id); e.vx = vx; e.vy = vy; this.settledSteps = 0; }

  /** Test helper: shove an entry straight away from the desk centre, hard enough to leave the desk. */
  knock(id) {
    const e = this.entries.get(id);
    const d = Math.hypot(e.x, e.y) || 1;
    this.kick(id, (e.x / d) * 14, (e.y / d) * 14);
  }

  step() {
    const falls = [];
    this.stepsMoving++;
    let moving = false;
    const pens = [...this.entries.values()].filter((e) => e.kind === 'pen' && !e.out);
    for (const e of this.entries.values()) {
      if (e.out) { e.fall = Math.min(PHYS.fallSteps, e.fall + 1); continue; }
      e.x += e.vx; e.y += e.vy;
      e.vx *= 1 - PHYS.frictionAir; e.vy *= 1 - PHYS.frictionAir;
      if (Math.abs(e.x) > DESK.w / 2 || Math.abs(e.y) > DESK.h / 2) {
        e.out = true; e.fall = 0; falls.push({ id: e.id, kind: e.kind }); continue;
      }
      if (Math.hypot(e.vx, e.vy) >= PHYS.settleSpeed) moving = true;
    }
    // crude collision: a moving pen hands its velocity to a pen it touches
    for (const a of pens) {
      if (a.out || Math.hypot(a.vx, a.vy) < 0.5) continue;
      for (const b of pens) {
        if (a === b || b.out) continue;
        if (Math.hypot(a.x - b.x, a.y - b.y) < 40) { b.vx += a.vx; b.vy += a.vy; a.vx = 0; a.vy = 0; moving = true; break; }
      }
    }
    this.settledSteps = moving ? 0 : this.settledSteps + 1;
    return { falls, hits: [] };
  }

  tickFall() { for (const e of this.entries.values()) if (e.out) e.fall = Math.min(PHYS.fallSteps, e.fall + 1); }
  isSettled() { return this.settledSteps >= PHYS.settleHoldSteps || this.stepsMoving >= PHYS.maxMoveSteps; }
  forceSettle() { for (const e of this.entries.values()) { e.vx = 0; e.vy = 0; } this.settledSteps = PHYS.settleHoldSteps; }
  snapshot() {
    const pens = []; const objs = [];
    for (const e of this.entries.values()) {
      const it = { id: e.id, x: e.x, y: e.y, a: e.a, out: e.out, fall: e.fall };
      if (e.kind === 'pen') pens.push(it); else { it.kind = e.kind; objs.push(it); }
    }
    return { pens, objs };
  }
  penPosition(id) { const e = this.entries.get(id); return e && !e.out ? { x: e.x, y: e.y } : null; }
  removePen(id) { this.entries.delete(id); }
  respawn(specs) {
    for (const s of specs) {
      const e = this.entries.get(s.id);
      if (e) { e.x = s.x; e.y = s.y; e.a = s.a || 0; e.vx = 0; e.vy = 0; e.out = false; e.fall = 0; }
    }
    this.settledSteps = 0;
  }
  destroy() { this.entries.clear(); }
}

export function makeConfig(over = {}) {
  return {
    mode: 'local', series: 3, shotClock: 0, seed: 1234,
    players: [
      { id: 'a', name: 'Ann', color: '#DC3545', penId: 'classic-blue', type: 'human' },
      { id: 'b', name: 'Bob', color: '#3B82F6', penId: 'crimson-strike', type: 'human' },
    ],
    ...over,
  };
}

/** Runs the session forward until the phase changes away from `moving` (or a cap is hit). */
export function runUntilSettled(session, maxMs = 60000) {
  let t = 0;
  while (session.phase === 'moving' && t < maxMs) { session.update(16.667); t += 16.667; }
  return t;
}
