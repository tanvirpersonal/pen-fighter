import test from 'node:test';
import assert from 'node:assert/strict';
import { GameSession } from '../src/game/GameSession.js';
import { makeRng } from '../src/game/rng.js';
import { FakePhysics, makeConfig, runUntilSettled } from './helpers/FakePhysics.js';

const human = (id, name) => ({ id, name, type: 'human', color: '#DC3545', penId: 'classic-blue' });

function make(over = {}, rngSeed = 7) {
  const s = new GameSession(makeConfig(over), { createPhysics: () => new FakePhysics(), rng: makeRng(rngSeed) });
  const log = [];
  s.on('*', (e) => log.push(e));
  s.start();
  return { s, log, count: (type) => log.filter((e) => e.type === type).length };
}

/** Current player fires a gentle shot along +x, then optionally knocks pens out before settling. */
function fire(s, { knockOut = [], angle = 0, power = 0.02 } = {}) {
  const res = s.shoot(s.turnId, angle, power);
  assert.ok(res.ok, `shot accepted: ${res.error}`);
  for (const id of knockOut) s.physics.knock(id); // shoved outward: certainly off the desk
  runUntilSettled(s);
}

test('start: aiming phase with the first player to act and pens on the desk', () => {
  const { s, count } = make();
  assert.equal(s.phase, 'aiming');
  assert.equal(s.turnId, 'a');
  assert.equal(s.round, 1);
  assert.equal(s.snapshot().pens.length, 2);
  assert.equal(s.snapshot().objs.length, 5);
  assert.equal(count('roundStart'), 1);
  assert.equal(count('turn'), 1);
  assert.equal(s.start(), false, 'start() twice is a no-op');
});

test('invalid configs throw instead of producing a broken match', () => {
  assert.throws(() => new GameSession(makeConfig({ series: 4 }), { createPhysics: () => new FakePhysics() }));
});

test('shoot validation: turn ownership, phase, values, double fire', () => {
  const { s } = make();
  assert.deepEqual(s.shoot('b', 0, 0.5), { ok: false, error: 'not_your_turn' });
  assert.deepEqual(s.shoot('nobody', 0, 0.5), { ok: false, error: 'not_your_turn' });
  assert.equal(s.shoot('a', NaN, 0.5).error, 'bad_value');
  assert.equal(s.shoot('a', 0, Infinity).error, 'bad_value');
  assert.equal(s.shoot('a', 0, -0.1).error, 'bad_power');
  assert.equal(s.shoot('a', 0, 1.5).error, 'bad_power');
  assert.equal(s.shoot('a', 'x', 0.5).error, 'bad_value');
  s.setPaused(true);
  assert.equal(s.shoot('a', 0, 0.5).error, 'paused');
  s.setPaused(false);
  assert.ok(s.shoot('a', 0, 0.1).ok);
  assert.equal(s.phase, 'moving');
  assert.equal(s.shoot('a', 0, 0.1).error, 'wrong_phase', 'a pen cannot be fired twice in one turn');
  assert.equal(s.shoot('b', 0, 0.1).error, 'wrong_phase', 'nobody can fire while pens are moving');
});

test('turn order: rotates through players and skips eliminated pens', () => {
  const { s } = make({ players: [human('a', 'Ann'), human('b', 'Bob'), human('c', 'Cy')] });
  assert.equal(s.turnId, 'a');
  fire(s);
  assert.equal(s.turnId, 'b');
  fire(s);
  assert.equal(s.turnId, 'c');
  fire(s, { knockOut: ['a'] });           // c's shot sends a off the desk
  assert.equal(s.getState().players.find((p) => p.id === 'a').alive, false);
  assert.equal(s.turnId, 'b', 'a is eliminated, so b is next');
  fire(s);
  assert.equal(s.turnId, 'c', 'a is skipped from now on');
});

test('a winner is not declared until everything has settled', () => {
  const { s } = make();
  s.shoot('a', 0, 0.02);
  s.physics.knock('b');
  for (let i = 0; i < 14; i++) s.update(16.7); // b has already fallen, but pens are still moving
  assert.equal(s.getState().players.find((p) => p.id === 'b').alive, false);
  assert.equal(s.phase, 'moving');
  assert.equal(s.roundResult, null);
  runUntilSettled(s);
  assert.equal(s.phase, 'roundEnd');
  assert.equal(s.roundResult.winnerId, 'a');
});

test('round win is scored exactly once and the series continues', () => {
  const { s, count } = make({ series: 3 });
  fire(s, { knockOut: ['b'] });
  assert.equal(s.phase, 'roundEnd');
  assert.deepEqual({ w: s.roundResult.winnerId, d: s.roundResult.draw }, { w: 'a', d: false });
  assert.equal(s.players.find((p) => p.id === 'a').wins, 1);
  // extra updates in roundEnd must not score again or change phase
  for (let i = 0; i < 200; i++) s.update(16.7);
  assert.equal(s.players.find((p) => p.id === 'a').wins, 1);
  assert.equal(count('roundEnd'), 1);
  assert.equal(count('matchEnd'), 0);
  assert.equal(s.nextRound(), true);
  assert.equal(s.round, 2);
  assert.equal(s.phase, 'aiming');
  assert.equal(s.turnId, 'b', 'starting player rotates each round');
  assert.equal(s.getState().players.every((p) => p.alive), true, 'everyone is back in for the next round');
  assert.equal(s.nextRound(), false, 'nextRound only works from roundEnd');
});

test('Single Round: one win ends the match, once', () => {
  const { s, count } = make({ series: 1 });
  fire(s, { knockOut: ['b'] });
  assert.equal(s.phase, 'matchEnd');
  assert.equal(s.matchResult.winnerId, 'a');
  assert.deepEqual(s.matchResult.wins, { a: 1, b: 0 });
  assert.equal(count('matchEnd'), 1);
  for (let i = 0; i < 100; i++) s.update(16.7);
  assert.equal(count('matchEnd'), 1);
  assert.equal(s.nextRound(), false);
});

test('Best of 3 needs two wins; Best of 5 needs three', () => {
  for (const [series, needed] of [[3, 2], [5, 3]]) {
    const { s, count } = make({ series });
    for (let r = 1; r <= needed; r++) {
      assert.equal(s.phase, 'aiming', `round ${r} should be playable (series ${series})`);
      // whoever's turn it is knocks out the other pen so 'a' wins every round
      const other = s.turnId === 'a' ? 'b' : 'a';
      const knock = s.turnId === 'a' ? 'b' : 'b';
      assert.ok(other);
      s.shoot(s.turnId, 0, 0.02);
      s.physics.knock(knock);
      runUntilSettled(s);
      if (r < needed) { assert.equal(s.phase, 'roundEnd'); s.nextRound(); }
    }
    assert.equal(s.phase, 'matchEnd', `series ${series} ends after ${needed} wins`);
    assert.equal(s.matchResult.winnerId, 'a');
    assert.equal(s.matchResult.roundsPlayed, needed);
    assert.equal(count('matchEnd'), 1);
    assert.equal(count('roundEnd'), needed);
  }
});

test('draw: all remaining pens fall together, nobody scores and the round is replayed', () => {
  const { s, count } = make({ series: 3 });
  fire(s, { knockOut: ['a', 'b'] });
  assert.equal(s.phase, 'roundEnd');
  assert.equal(s.roundResult.draw, true);
  assert.equal(s.roundResult.winnerId, null);
  assert.equal(s.players.every((p) => p.wins === 0), true);
  assert.equal(count('matchEnd'), 0);
  s.nextRound();
  assert.equal(s.round, 1, 'a drawn round does not advance the round number');
  assert.equal(s.phase, 'aiming');
});

test('shot clock: timeout skips the turn; disabled clock never does', () => {
  const { s, count } = make({ shotClock: 10 });
  assert.equal(s.clockLeft, 10);
  s.update(100); s.update(100);
  assert.ok(s.clockLeft < 10 && s.clockLeft > 9.5);
  for (let i = 0; i < 101; i++) s.update(100); // ~10.2 s
  assert.equal(count('turnSkipped'), 1);
  assert.equal(s.turnId, 'b');
  assert.ok(s.clockLeft > 9 && s.clockLeft <= 10, 'clock restarted for the next player');
  assert.equal(s.phase, 'aiming');

  const off = make({ shotClock: 0 });
  assert.equal(off.s.clockLeft, null);
  for (let i = 0; i < 2000; i++) off.s.update(100);
  assert.equal(off.count('turnSkipped'), 0);
  assert.equal(off.s.turnId, 'a');
});

test('shot clock: paused clock does not count down; pausing the game freezes everything', () => {
  const { s } = make({ shotClock: 10 });
  s.setClockPaused(true);
  for (let i = 0; i < 50; i++) s.update(100);
  assert.equal(s.clockLeft, 10);
  s.setClockPaused(false);
  s.setPaused(true);
  for (let i = 0; i < 50; i++) s.update(100);
  assert.equal(s.clockLeft, 10);
  s.setPaused(false);
  s.update(1000);
  assert.ok(s.clockLeft < 10);
});

test('stalemate: everyone timing out repeatedly ends the round as a draw instead of hanging', () => {
  const { s, count } = make({ shotClock: 10 });
  for (let i = 0; i < 4000 && s.phase === 'aiming'; i++) s.update(100);
  assert.equal(s.phase, 'roundEnd');
  assert.equal(s.roundResult.draw, true);
  assert.equal(s.roundResult.reason, 'stalemate');
  assert.equal(count('turnSkipped'), 4, 'two skips per surviving player');
});

test('movement time cap: a world that never settles is force-settled', () => {
  const { s } = make();
  const orig = s.physics.step.bind(s.physics);
  s.physics.step = () => { const r = orig(); s.physics.settledSteps = 0; return r; };
  s.shoot('a', 0, 0.02);
  const t = runUntilSettled(s, 60000);
  assert.notEqual(s.phase, 'moving');
  assert.ok(t < 20000, `resolved in ${t}ms`);
});

test('frame-rate independence: the same shot resolves identically at 30, 60 and 144 fps', () => {
  const results = [];
  for (const dt of [33.333, 16.667, 6.944]) {
    const { s } = make({ series: 3 });
    s.shoot('a', 0.3, 0.6);
    let t = 0;
    while (s.phase === 'moving' && t < 60000) { s.update(dt); t += dt; }
    const snap = s.snapshot();
    results.push(snap.pens.map((p) => [Math.round(p.x), Math.round(p.y)]).join('|'));
  }
  assert.equal(results[0], results[1]);
  assert.equal(results[1], results[2]);
});

test('huge frame gaps (tab was hidden) cannot fast-forward the simulation', () => {
  const { s } = make({ shotClock: 10 });
  s.update(60_000); // a minute passes in one frame
  assert.ok(s.clockLeft > 9.8, 'one frame advances at most 100 ms');
});

test('AI takes a valid turn on its own through the same shoot() path', () => {
  const players = [human('h', 'Me'), { id: 'c', name: 'CPU', type: 'ai', aiLevel: 'hard', color: '#3B82F6', penId: 'neon-phantom' }];
  const { s, log } = make({ mode: 'ai', players });
  fire(s); // human shoots; no falls
  assert.equal(s.turnId, 'c');
  let t = 0;
  while (s.phase === 'aiming' && t < 5000) { s.update(50); t += 50; }
  assert.equal(s.phase, 'moving', 'AI fired within its think time');
  const shot = log.find((e) => e.type === 'shot' && e.playerId === 'c');
  assert.ok(shot && shot.power >= 0 && shot.power <= 1 && Number.isFinite(shot.angle));
  runUntilSettled(s);
  assert.notEqual(s.phase, 'moving');
});

test('AI waits while the clock is paused (pass-and-play style interstitial)', () => {
  const players = [human('h', 'Me'), { id: 'c', name: 'CPU', type: 'ai', aiLevel: 'easy', color: '#3B82F6', penId: 'classic-blue' }];
  const { s } = make({ mode: 'ai', players });
  fire(s);
  s.setClockPaused(true);
  for (let i = 0; i < 200; i++) s.update(50);
  assert.equal(s.phase, 'aiming');
});

test('forfeit: pen removed, turn moves on, last player standing wins the match', () => {
  const { s, count } = make({ players: [human('a', 'A'), human('b', 'B'), human('c', 'C')] });
  assert.equal(s.turnId, 'a');
  assert.equal(s.forfeit('a'), true);
  assert.equal(s.turnId, 'b', 'turn passes on when the current player forfeits');
  assert.equal(s.snapshot().pens.length, 2);
  assert.equal(s.forfeit('a'), false, 'cannot forfeit twice');
  assert.equal(s.phase, 'aiming');
  s.forfeit('b');
  assert.equal(s.phase, 'matchEnd');
  assert.equal(s.matchResult.winnerId, 'c');
  assert.equal(s.matchResult.reason, 'forfeit');
  assert.equal(count('matchEnd'), 1);
  assert.equal(s.shoot('c', 0, 0.2).ok, false);
});

test('forfeit while pens are moving is resolved after they settle', () => {
  const { s } = make({ players: [human('a', 'A'), human('b', 'B'), human('c', 'C')] });
  s.shoot('a', 0, 0.05);
  s.forfeit('c');
  runUntilSettled(s);
  assert.equal(s.phase, 'aiming');
  assert.equal(s.turnId, 'b');
});

test('replay round: draws always, decided rounds take their point back (not online)', () => {
  const { s } = make({ series: 5 });
  fire(s, { knockOut: ['b'] });
  assert.equal(s.players[0].wins, 1);
  assert.equal(s.replayRound(), true);
  assert.equal(s.players[0].wins, 0, 'replayed round is not counted');
  assert.equal(s.round, 1);
  assert.equal(s.phase, 'aiming');

  const online = make({ mode: 'online', series: 5 });
  fire(online.s, { knockOut: ['b'] });
  assert.equal(online.s.replayRound(), false, 'online results cannot be undone');
  assert.equal(online.s.players[0].wins, 1);
  assert.equal(online.s.nextRound(), true);

  const draw = make({ mode: 'online' });
  fire(draw.s, { knockOut: ['a', 'b'] });
  assert.equal(draw.s.replayRound(), true, 'drawn rounds can be replayed even online');
});

test('rematch resets scores and starts a fresh match', () => {
  const { s, count } = make({ series: 1 });
  fire(s, { knockOut: ['b'] });
  assert.equal(s.phase, 'matchEnd');
  assert.equal(s.rematch(), true);
  assert.equal(s.phase, 'aiming');
  assert.equal(s.matchResult, null);
  assert.equal(s.players.every((p) => p.wins === 0), true);
  assert.equal(s.round, 1);
  assert.equal(count('rematch'), 1);
});

test('practice: never scores, falls are reset, and manual reset works', () => {
  const players = [
    { id: 'h', name: 'Me', type: 'human', color: '#DC3545', penId: 'classic-blue' },
    { id: 't1', name: 'Target', type: 'dummy', color: '#999999', penId: 'classic-blue' },
    { id: 't2', name: 'Target', type: 'dummy', color: '#999999', penId: 'classic-blue' },
  ];
  const { s, count } = make({ mode: 'practice', series: 1, players });
  assert.equal(s.snapshot().pens.length, 3);
  fire(s, { knockOut: ['h'] });
  assert.equal(s.phase, 'aiming');
  assert.equal(s.snapshot().pens.every((p) => !p.out), true, 'pens are put back after a fall');
  assert.equal(count('practiceReset'), 1);
  assert.equal(count('roundEnd'), 0);
  assert.equal(count('matchEnd'), 0);
  assert.equal(s.players.every((p) => p.wins === 0), true);
  assert.equal(s.turnId, 'h');
  // dummies never take turns
  fire(s);
  assert.equal(s.turnId, 'h');
  assert.equal(s.shoot('t1', 0, 0.5).ok, false);
  s.shoot('h', 0, 0.02); s.physics.knock('t1'); runUntilSettled(s);
  assert.equal(s.snapshot().pens.every((p) => !p.out), true);
  assert.equal(s.resetPractice(), true);
  const normal = make();
  assert.equal(normal.s.resetPractice(), false);
});

test('getState exposes plain data and does not leak internals', () => {
  const { s } = make({ shotClock: 15 });
  const st = s.getState();
  assert.equal(st.phase, 'aiming');
  assert.equal(st.shotClock, 15);
  assert.equal(st.toWin, 2);
  assert.equal(st.players.length, 2);
  assert.ok(!('physics' in st) && !('rng' in st));
  st.players[0].wins = 99;
  assert.equal(s.players[0].wins, 0, 'mutating the copy does not touch the session');
});

test('destroy releases physics and listeners; later calls are inert', () => {
  const { s, log } = make();
  s.destroy();
  assert.equal(s.physics, null);
  const before = log.length;
  s.update(1000);
  assert.equal(s.shoot('a', 0, 0.5).ok, false);
  assert.equal(log.length, before);
});

test('a full 6-player match with random shots always terminates', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
  const players = ids.map((id) => human(id, id));
  const rng = makeRng(2024);
  const { s, count } = make({ players, series: 3, shotClock: 10 });
  let guard = 0;
  while (s.phase !== 'matchEnd' && guard++ < 5000) {
    if (s.phase === 'roundEnd') s.nextRound();
    else if (s.phase === 'aiming') {
      if (rng() < 0.1) { for (let i = 0; i < 101; i++) s.update(100); continue; } // sometimes time out
      s.shoot(s.turnId, rng() * 6.28 - 3.14, 0.1 + rng() * 0.9);
    } else s.update(16.7);
  }
  assert.equal(s.phase, 'matchEnd', 'match finished within the guard');
  assert.equal(count('matchEnd'), 1);
  const w = s.matchResult.winnerId;
  assert.ok(w === null || ids.includes(w));
});
