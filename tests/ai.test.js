import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseShot, rayToEdge, edgeDistance, AI_PROFILES } from '../src/ai/AIController.js';
import { makeRng } from '../src/game/rng.js';
import { SHOT } from '../src/config/constants.js';

const snap = (pens) => ({ pens: pens.map((p) => ({ out: false, a: 0, fall: 0, ...p })), objs: [] });

test('edge helpers', () => {
  assert.equal(edgeDistance(0, 0), 280);
  assert.equal(edgeDistance(440, 0), 10);
  assert.ok(edgeDistance(460, 0) < 0);
  assert.equal(Math.round(rayToEdge(0, 0, 0)), 450);
  assert.equal(Math.round(rayToEdge(0, 0, Math.PI / 2)), 280);
  assert.equal(Math.round(rayToEdge(100, 0, Math.PI)), 550);
});

test('every level returns a valid shot at the nearest enemy (statistically)', () => {
  const s = snap([{ id: 'me', x: -300, y: 0 }, { id: 'near', x: -100, y: 0 }, { id: 'far', x: 350, y: 150 }]);
  for (const level of ['easy', 'medium', 'hard']) {
    const rng = makeRng(99);
    let towardNear = 0;
    const N = 200;
    for (let i = 0; i < N; i++) {
      const { angle, power } = chooseShot(s, 'me', ['near', 'far'], level, rng);
      assert.ok(Number.isFinite(angle) && angle >= -Math.PI - 1e-9 && angle <= Math.PI + 1e-9);
      assert.ok(power >= 0 && power <= 1, `power in range (${level})`);
      if (level !== 'hard') assert.ok(power >= 0.22, `${level} never fires below a nudge`);
      if (Math.abs(angle) < 0.6) towardNear++;
    }
    const ratio = towardNear / N;
    if (level === 'hard') assert.ok(ratio > 0.9, `hard is accurate (${ratio})`);
    if (level === 'medium') assert.ok(ratio > 0.8, `medium is mostly accurate (${ratio})`);
  }
});

test('accuracy ordering: hard has less angular error than medium than easy', () => {
  const s = snap([{ id: 'me', x: -300, y: 0 }, { id: 'foe', x: 200, y: 0 }]);
  const err = (level) => {
    const rng = makeRng(5);
    let sum = 0;
    for (let i = 0; i < 400; i++) {
      const { angle } = chooseShot(s, 'me', ['foe'], level, rng);
      sum += Math.abs(angle);
    }
    return sum / 400;
  };
  const [e, m, h] = [err('easy'), err('medium'), err('hard')];
  assert.ok(h < m && m < e, `expected hard(${h}) < medium(${m}) < easy(${e})`);
});

test('hard AI does not choose a power that slides itself off the desk', () => {
  // me is near the right edge shooting along +x at a foe that is also close to the edge.
  const s = snap([{ id: 'me', x: 380, y: 0 }, { id: 'foe', x: 420, y: 0 }]);
  const rng = makeRng(1);
  for (let i = 0; i < 100; i++) {
    const { angle, power } = chooseShot(s, 'me', ['foe'], 'hard', rng);
    const room = rayToEdge(380, 0, angle);
    const speed = SHOT.minSpeed + power * (SHOT.maxSpeed - SHOT.minSpeed);
    const travel = speed / 0.03;
    // at the very least it must not plan to travel far past the edge
    assert.ok(travel < room + 120, `planned travel ${travel} vs room ${room}`);
  }
});

test('AI falls back safely with no valid target', () => {
  const s = snap([{ id: 'me', x: 0, y: 0 }, { id: 'gone', x: 10, y: 10, out: true }]);
  const r = chooseShot(s, 'me', ['gone'], 'medium', makeRng(1));
  assert.ok(Number.isFinite(r.angle) && r.power > 0);
  const r2 = chooseShot(snap([{ id: 'other', x: 0, y: 0 }]), 'me', ['other'], 'easy', makeRng(1));
  assert.ok(Number.isFinite(r2.angle));
});

test('AI profiles define think times in a sensible range', () => {
  for (const p of Object.values(AI_PROFILES)) {
    assert.ok(p.think[0] < p.think[1] && p.think[1] < 3000);
  }
});
