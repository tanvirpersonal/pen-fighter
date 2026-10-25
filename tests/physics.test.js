// Tests for the real Matter.js world. They skip automatically when matter-js is not installed
// (run `npm install` first), so `npm test` stays green in a fresh checkout without dependencies.

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildArena } from '../src/physics/layout.js';
import { DESK, PHYS } from '../src/config/constants.js';

let PhysicsWorld = null;
try {
  ({ PhysicsWorld } = await import('../src/physics/PhysicsWorld.js'));
} catch {
  PhysicsWorld = null;
}
const opts = PhysicsWorld ? {} : { skip: 'matter-js is not installed (run npm install)' };

const players = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, type: 'human' }));

function runUntilSettled(w, cap = 2000) {
  let steps = 0;
  const falls = [];
  while (!w.isSettled() && steps < cap) { falls.push(...w.step().falls); steps++; }
  return { steps, falls };
}

test('arena builds with the expected bodies', opts, () => {
  const w = new PhysicsWorld();
  w.reset(buildArena(players(3), 1));
  const s = w.snapshot();
  assert.equal(s.pens.length, 3);
  assert.equal(s.objs.length, 5);
  assert.ok(s.pens.every((p) => !p.out));
  w.destroy();
});

test('a resting arena settles immediately and nothing moves', opts, () => {
  const w = new PhysicsWorld();
  w.reset(buildArena(players(2), 1));
  const before = JSON.stringify(w.snapshot());
  const { steps } = runUntilSettled(w);
  assert.ok(steps <= PHYS.settleHoldSteps + 2);
  assert.equal(JSON.stringify(w.snapshot()), before);
  w.destroy();
});

test('stronger shots travel further, in the commanded direction', opts, () => {
  const dist = (power) => {
    const w = new PhysicsWorld();
    w.reset({ pens: [{ id: 'a', x: -300, y: 0, a: 0 }], objects: [] });
    w.shoot('a', 0, power);
    runUntilSettled(w);
    const p = w.snapshot().pens[0];
    w.destroy();
    return { dx: p.x + 300, dy: p.y, out: p.out };
  };
  const weak = dist(0.2);
  const mid = dist(0.45);
  assert.ok(weak.dx > 20 && weak.dx < mid.dx, `weak ${weak.dx} < mid ${mid.dx}`);
  assert.ok(Math.abs(weak.dy) < 1 && Math.abs(mid.dy) < 1, 'travels along +x');
});

test('a hard shot off the desk edge eliminates the pen exactly once', opts, () => {
  const w = new PhysicsWorld();
  w.reset({ pens: [{ id: 'a', x: 300, y: 0, a: 0 }], objects: [] });
  w.shoot('a', 0, 1);
  const { falls } = runUntilSettled(w);
  assert.equal(falls.filter((f) => f.id === 'a').length, 1);
  assert.equal(w.snapshot().pens[0].out, true);
  assert.ok(w.penPosition('a') === null);
  w.destroy();
});

test('pen-pen collision transfers momentum', opts, () => {
  const w = new PhysicsWorld();
  w.reset({ pens: [{ id: 'a', x: -100, y: 0, a: 0 }, { id: 'b', x: 60, y: 0, a: 0 }], objects: [] });
  w.shoot('a', 0, 0.6);
  runUntilSettled(w);
  const b = w.snapshot().pens.find((p) => p.id === 'b');
  assert.ok(b.x > 60 + 5, `b was pushed (x=${b.x})`);
  w.destroy();
});

test('simulation is deterministic: same inputs, same result', opts, () => {
  const run = () => {
    const w = new PhysicsWorld();
    w.reset(buildArena(players(4), 99));
    w.shoot('p0', 0.1, 0.9);
    runUntilSettled(w);
    const s = JSON.stringify(w.snapshot());
    w.destroy();
    return s;
  };
  assert.equal(run(), run());
});

test('settle detection terminates for random violent shots and keeps bodies finite', opts, () => {
  for (let seed = 1; seed <= 15; seed++) {
    const w = new PhysicsWorld();
    w.reset(buildArena(players(6), seed));
    w.shoot('p0', seed, 1);
    const { steps } = runUntilSettled(w, PHYS.maxMoveSteps + 5);
    assert.ok(steps <= PHYS.maxMoveSteps + 1, `seed ${seed} settled in ${steps}`);
    for (const p of w.snapshot().pens) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
    w.destroy();
  }
});

test('desk objects can be knocked off; falling counters advance and then hide', opts, () => {
  const w = new PhysicsWorld();
  w.reset({ pens: [{ id: 'a', x: 380, y: 0, a: 0 }], objects: [{ id: 'coin', kind: 'coin', x: 420, y: 0, a: 0 }] });
  w.shoot('a', 0, 0.8);
  runUntilSettled(w);
  const coin = w.snapshot().objs[0];
  assert.equal(coin.out, true);
  for (let i = 0; i < PHYS.fallSteps + 5; i++) w.tickFall();
  assert.ok(w.snapshot().objs[0].fall >= PHYS.fallSteps);
  w.destroy();
});

test('respawn restores fallen pens; removePen deletes them', opts, () => {
  const w = new PhysicsWorld();
  const arena = buildArena(players(2), 3);
  w.reset(arena);
  w.shoot('p0', Math.PI, 1); // straight off the left edge
  runUntilSettled(w);
  assert.equal(w.snapshot().pens.find((p) => p.id === 'p0').out, true);
  w.respawn(arena.pens);
  const p0 = w.snapshot().pens.find((p) => p.id === 'p0');
  assert.equal(p0.out, false);
  assert.ok(Math.abs(p0.x - arena.pens[0].x) < 0.01);
  w.removePen('p1');
  assert.equal(w.snapshot().pens.length, 1);
  w.destroy();
});

test('desk constants are consistent with the spawn layout', () => {
  const arena = buildArena(players(6), 1);
  for (const p of arena.pens) assert.ok(Math.abs(p.x) < DESK.w / 2 && Math.abs(p.y) < DESK.h / 2);
});
