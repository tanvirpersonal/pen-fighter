// Authoritative 2D physics, built on Matter.js. Headless: no DOM, no rendering.
// Runs in the browser (local play) and in Node (the multiplayer server).
//
// Interface shared with the test stand-in (tests/helpers/FakePhysics.js):
//   reset(spec) shoot(id, angle, power) step() tickFall() isSettled() forceSettle()
//   snapshot() removePen(id) respawn(specs) penPosition(id) destroy()

import Matter from 'matter-js';
import { DESK, PEN_DIMS, PHYS, speedForPower } from '../config/constants.js';

const { Engine, Bodies, Body, Composite, Events } = Matter;

const HALF_W = DESK.w / 2;
const HALF_H = DESK.h / 2;

const OBJECT_DEFS = {
  eraser: () => ({ w: 72, h: 34, density: 0.0016, frictionAir: 0.06, restitution: 0.3, chamfer: 5 }),
  sharpener: () => ({ w: 38, h: 28, density: 0.0014, frictionAir: 0.055, restitution: 0.35, chamfer: 4 }),
  coin: () => ({ r: 16, density: 0.0012, frictionAir: 0.035, restitution: 0.7 }),
};

export class PhysicsWorld {
  constructor() {
    this.engine = Engine.create({
      gravity: { x: 0, y: 0, scale: 0 },
      positionIterations: PHYS.positionIterations,
      velocityIterations: PHYS.velocityIterations,
      enableSleeping: false,
    });
    this.entries = new Map(); // id -> { id, kind, body, out, fall, hidden }
    this.settledSteps = 0;
    this.stepsMoving = 0;
    this._falls = [];
    this._hits = [];
    this._onCollision = (evt) => {
      for (const pair of evt.pairs) {
        const a = pair.bodyA;
        const b = pair.bodyB;
        const dvx = a.velocity.x - b.velocity.x;
        const dvy = a.velocity.y - b.velocity.y;
        const intensity = Math.hypot(dvx, dvy);
        if (intensity < 1.2) continue;
        const ka = a.plugin?.kind || 'pen';
        const kb = b.plugin?.kind || 'pen';
        this._hits.push({ intensity: Math.min(intensity, 30), kinds: [ka, kb] });
      }
    };
    Events.on(this.engine, 'collisionStart', this._onCollision);
  }

  /** Rebuilds the whole arena. */
  reset(spec) {
    Composite.clear(this.engine.world, false);
    this.entries.clear();
    this.settledSteps = 0;
    this.stepsMoving = 0;
    this._falls.length = 0;
    this._hits.length = 0;
    for (const p of spec.pens) this._addPen(p);
    for (const o of spec.objects) this._addObject(o);
  }

  _addPen(p) {
    const body = Bodies.rectangle(p.x, p.y, PEN_DIMS.len, PEN_DIMS.wid, {
      angle: p.a || 0,
      restitution: PHYS.restitution,
      friction: PHYS.friction,
      frictionStatic: 0,
      frictionAir: PHYS.frictionAir,
      density: 0.0012,
      chamfer: { radius: 4 },
      label: 'pen',
      plugin: { kind: 'pen' },
    });
    Composite.add(this.engine.world, body);
    this.entries.set(p.id, { id: p.id, kind: 'pen', body, out: false, fall: 0, hidden: false });
  }

  _addObject(o) {
    const def = OBJECT_DEFS[o.kind]?.();
    if (!def) return;
    const common = {
      angle: o.a || 0,
      restitution: def.restitution,
      friction: PHYS.friction,
      frictionStatic: 0,
      frictionAir: def.frictionAir,
      density: def.density,
      label: o.kind,
      plugin: { kind: o.kind },
    };
    const body = o.kind === 'coin'
      ? Bodies.circle(o.x, o.y, def.r, common)
      : Bodies.rectangle(o.x, o.y, def.w, def.h, { ...common, chamfer: { radius: def.chamfer } });
    Composite.add(this.engine.world, body);
    this.entries.set(o.id, { id: o.id, kind: o.kind, body, out: false, fall: 0, hidden: false });
  }

  /** Launches a pen. Direction is the launch angle (radians); power is 0..1. */
  shoot(id, angle, power) {
    const e = this.entries.get(id);
    if (!e || e.kind !== 'pen' || e.out) return false;
    const v = speedForPower(power);
    Body.setVelocity(e.body, { x: Math.cos(angle) * v, y: Math.sin(angle) * v });
    Body.setAngularVelocity(e.body, 0);
    this.settledSteps = 0;
    this.stepsMoving = 0;
    return true;
  }

  /** Advances the simulation one fixed step. Returns fall and collision events since the last call. */
  step() {
    Engine.update(this.engine, PHYS.step);
    this.stepsMoving++;
    let moving = false;
    for (const e of this.entries.values()) {
      if (e.out) {
        if (e.fall < PHYS.fallSteps) e.fall++;
        if (e.fall >= PHYS.fallSteps && !e.hidden) {
          e.hidden = true;
          Body.setStatic(e.body, true);
        }
        continue;
      }
      const { x, y } = e.body.position;
      if (Math.abs(x) > HALF_W || Math.abs(y) > HALF_H) {
        e.out = true;
        e.fall = 0;
        e.body.collisionFilter.mask = 0; // no more collisions; keeps drifting while it falls
        this._falls.push({ id: e.id, kind: e.kind });
        continue;
      }
      if (e.body.speed >= PHYS.settleSpeed || Math.abs(e.body.angularSpeed) >= PHYS.settleAngular) moving = true;
    }
    this.settledSteps = moving ? 0 : this.settledSteps + 1;
    const events = { falls: this._falls, hits: this._hits };
    this._falls = [];
    this._hits = [];
    return events;
  }

  /** Advances only the cosmetic fall animation (used when the simulation is not running). */
  tickFall() {
    for (const e of this.entries.values()) {
      if (e.out && e.fall < PHYS.fallSteps) e.fall++;
      if (e.out && e.fall >= PHYS.fallSteps) e.hidden = true;
    }
  }

  isSettled() {
    return this.settledSteps >= PHYS.settleHoldSteps || this.stepsMoving >= PHYS.maxMoveSteps;
  }

  /** Stops every body still on the desk (used when the movement time limit is hit). */
  forceSettle() {
    for (const e of this.entries.values()) {
      if (e.out) continue;
      Body.setVelocity(e.body, { x: 0, y: 0 });
      Body.setAngularVelocity(e.body, 0);
    }
    this.settledSteps = PHYS.settleHoldSteps;
  }

  snapshot() {
    const pens = [];
    const objs = [];
    for (const e of this.entries.values()) {
      const item = {
        id: e.id,
        x: round2(e.body.position.x),
        y: round2(e.body.position.y),
        a: round3(e.body.angle),
        out: e.out,
        fall: e.fall,
      };
      if (e.kind === 'pen') pens.push(item);
      else { item.kind = e.kind; objs.push(item); }
    }
    return { pens, objs };
  }

  penPosition(id) {
    const e = this.entries.get(id);
    return e && !e.out ? { x: e.body.position.x, y: e.body.position.y } : null;
  }

  removePen(id) {
    const e = this.entries.get(id);
    if (!e) return;
    Composite.remove(this.engine.world, e.body);
    this.entries.delete(id);
  }

  /** Practice mode: puts pens (and targets) back on their start marks. */
  respawn(specs) {
    for (const s of specs) {
      const e = this.entries.get(s.id);
      if (!e) { this._addPen(s); continue; }
      Body.setStatic(e.body, false);
      Body.setPosition(e.body, { x: s.x, y: s.y });
      Body.setAngle(e.body, s.a || 0);
      Body.setVelocity(e.body, { x: 0, y: 0 });
      Body.setAngularVelocity(e.body, 0);
      e.body.collisionFilter.mask = 0xffffffff;
      e.out = false;
      e.fall = 0;
      e.hidden = false;
    }
    this.settledSteps = 0;
  }

  destroy() {
    Events.off(this.engine, 'collisionStart', this._onCollision);
    Composite.clear(this.engine.world, false);
    Engine.clear(this.engine);
    this.entries.clear();
  }
}

function round2(n) { return Math.round(n * 100) / 100; }
function round3(n) { return Math.round(n * 1000) / 1000; }
