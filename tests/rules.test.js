import test from 'node:test';
import assert from 'node:assert/strict';
import { roundsToWin, winRate, seriesDecided } from '../src/game/Scoring.js';
import { validateMatchConfig, sanitizeName, sanitizeColor } from '../src/game/MatchConfig.js';
import { SaveManager, defaultSave, migrate, sanitize, SAVE_KEY } from '../src/storage/SaveManager.js';
import { ringSpawns, objectLayout, buildArena } from '../src/physics/layout.js';
import { DESK, PEN_DIMS, powerFromPull, speedForPower, powerForSpeed, SHOT } from '../src/config/constants.js';
import { makeConfig } from './helpers/FakePhysics.js';

test('series -> rounds needed to win', () => {
  assert.equal(roundsToWin(1), 1);
  assert.equal(roundsToWin(3), 2);
  assert.equal(roundsToWin(5), 3);
  assert.equal(seriesDecided(1, 1), true);
  assert.equal(seriesDecided(1, 3), false);
  assert.equal(seriesDecided(2, 3), true);
  assert.equal(seriesDecided(2, 5), false);
  assert.equal(seriesDecided(3, 5), true);
});

test('win rate is an integer percentage and safe for zero matches', () => {
  assert.equal(winRate(0, 0), 0);
  assert.equal(winRate(4, 3), 75);
  assert.equal(winRate(3, 1), 33);
});

test('shot power mapping is monotonic and bounded', () => {
  assert.equal(powerFromPull(0), 0);
  assert.equal(powerFromPull(SHOT.minPull - 1), 0);
  assert.equal(powerFromPull(SHOT.maxPull), 1);
  assert.equal(powerFromPull(SHOT.maxPull * 5), 1);
  assert.ok(powerFromPull(60) < powerFromPull(100));
  assert.equal(speedForPower(0), SHOT.minSpeed);
  assert.equal(speedForPower(1), SHOT.maxSpeed);
  assert.equal(speedForPower(7), SHOT.maxSpeed);
  assert.ok(Math.abs(powerForSpeed(speedForPower(0.4)) - 0.4) < 1e-9);
});

test('config validation: valid modes pass', () => {
  assert.ok(validateMatchConfig(makeConfig()).ok);
  const quick = makeConfig({ mode: 'quick', players: [
    { id: 'h', name: 'Me', type: 'human', color: '#DC3545', penId: 'classic-blue' },
    { id: 'c', name: 'CPU', type: 'ai', aiLevel: 'medium', color: '#3B82F6', penId: 'neon-phantom' },
  ] });
  assert.ok(validateMatchConfig(quick).ok);
  const practice = makeConfig({ mode: 'practice', players: [
    { id: 'h', type: 'human' }, { id: 't1', type: 'dummy' }, { id: 't2', type: 'dummy' },
  ] });
  const r = validateMatchConfig(practice);
  assert.ok(r.ok, r.errors.join());
  assert.equal(r.value.shotClock, 0, 'practice has no shot clock');
});

test('config validation: bad configs are rejected with reasons', () => {
  const bad = (over) => validateMatchConfig(makeConfig(over));
  assert.equal(bad({ series: 4 }).ok, false);
  assert.equal(bad({ shotClock: 7 }).ok, false);
  assert.equal(bad({ mode: 'nope' }).ok, false);
  assert.equal(bad({ players: [{ id: 'a', type: 'human' }] }).ok, false, 'one competitor');
  assert.equal(bad({ players: [
    { id: 'a', type: 'human' }, { id: 'a', type: 'human' },
  ] }).ok, false, 'duplicate ids');
  assert.equal(bad({ players: [
    { id: 'a', type: 'ai', aiLevel: 'medium' }, { id: 'b', type: 'ai', aiLevel: 'hard' },
  ] }).ok, false, 'no human');
  assert.equal(bad({ players: [
    { id: 'a', type: 'human' }, { id: 'b', type: 'ai', aiLevel: 'godlike' },
  ] }).ok, false, 'bad ai level');
  assert.equal(bad({ mode: 'online', players: [
    { id: 'a', type: 'human' }, { id: 'b', type: 'ai', aiLevel: 'easy' },
  ] }).ok, false, 'online has no AI');
  const seven = Array.from({ length: 7 }, (_, i) => ({ id: `p${i}`, type: 'human' }));
  assert.equal(bad({ players: seven }).ok, false, 'too many players');
  assert.equal(validateMatchConfig(null).ok, false);
});

test('names and colours are sanitised', () => {
  assert.equal(sanitizeName('  <b>Hi</b>\n there  '), 'bHi/b there');
  assert.equal(sanitizeName('x'.repeat(40)).length, 16);
  assert.equal(sanitizeName('   ', 'Fallback'), 'Fallback');
  assert.equal(sanitizeName(42, 'Fallback'), 'Fallback');
  assert.equal(sanitizeColor('#abcdef'), '#ABCDEF');
  assert.equal(sanitizeColor('red', '#111111'), '#111111');
});

function memStorage(initial) {
  const m = new Map(initial ? Object.entries(initial) : []);
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k), _m: m };
}

test('save data: missing or corrupted storage falls back to defaults', () => {
  assert.deepEqual(new SaveManager(memStorage()).get(), defaultSave());
  assert.deepEqual(new SaveManager(memStorage({ [SAVE_KEY]: '{not json' })).get(), defaultSave());
  assert.deepEqual(new SaveManager(memStorage({ [SAVE_KEY]: '42' })).get(), defaultSave());
  const throwing = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  const sm = new SaveManager(throwing);
  assert.deepEqual(sm.get(), defaultSave());
  assert.doesNotThrow(() => sm.update((d) => { d.profile.name = 'Zed'; }));
  assert.equal(sm.get().profile.name, 'Zed', 'still works in memory when storage throws');
});

test('save data: out-of-range values are clamped to valid ones', () => {
  const dirty = { version: 1, profile: { name: '', color: 'nope', penId: 'ghost-pen' },
    settings: { sound: 'yes', view: '4d', series: 9, shotClock: -3, camera: 'x', quality: 'ultra', lang: 'fr', aiLevel: 'impossible' },
    setup: { playerCount: 99, aiCount: -4, aiLevel: 'x' },
    stats: { local: { matchesPlayed: -5, matchesWon: 'a', roundsWon: 2.9 }, online: null } };
  const s = sanitize(dirty);
  const d = defaultSave();
  assert.equal(s.profile.penId, d.profile.penId);
  assert.equal(s.settings.series, d.settings.series);
  assert.equal(s.settings.lang, d.settings.lang);
  assert.equal(s.settings.view, d.settings.view);
  assert.equal(s.setup.playerCount, 6);
  assert.equal(s.setup.aiCount, 0);
  assert.equal(s.stats.local.matchesPlayed, 0);
  assert.equal(s.stats.local.roundsWon, 2);
  assert.deepEqual(s.stats.online, d.stats.online);
});

test('save data: old unversioned saves migrate', () => {
  const m = migrate({ name: 'Old Timer', sound: false, matchesPlayed: 10, matchesWon: 4, roundsWon: 12 });
  assert.equal(m.version, 1);
  assert.equal(m.profile.name, 'Old Timer');
  assert.equal(m.settings.sound, false);
  assert.equal(m.stats.local.matchesPlayed, 10);
  assert.equal(m.stats.local.matchesWon, 4);
});

test('save data: stats are kept separate for local and online, and resets work', () => {
  const sm = new SaveManager(memStorage());
  sm.recordMatch({ scope: 'local', won: true, roundsWon: 2 });
  sm.recordMatch({ scope: 'online', won: false, roundsWon: 1 });
  assert.deepEqual(sm.get().stats.local, { matchesPlayed: 1, matchesWon: 1, roundsWon: 2 });
  assert.deepEqual(sm.get().stats.online, { matchesPlayed: 1, matchesWon: 0, roundsWon: 1 });
  sm.update((d) => { d.settings.series = 5; d.profile.name = 'Keep'; });
  sm.resetSettings();
  assert.equal(sm.get().settings.series, defaultSave().settings.series);
  assert.equal(sm.get().profile.name, 'Keep', 'resetting settings keeps the profile');
  assert.equal(sm.get().stats.local.matchesPlayed, 1, 'resetting settings keeps stats');
  sm.resetStats();
  assert.equal(sm.get().stats.local.matchesPlayed, 0);
  // persisted and reloadable
  const store = memStorage();
  const a = new SaveManager(store);
  a.update((d) => { d.profile.name = 'Persist'; });
  assert.equal(new SaveManager(store).get().profile.name, 'Persist');
});

test('layout: spawns are inside the desk, spaced apart, facing the centre', () => {
  for (let n = 2; n <= 6; n++) {
    const sp = ringSpawns(n);
    assert.equal(sp.length, n);
    for (const s of sp) {
      assert.ok(Math.abs(s.x) < DESK.w / 2 - PEN_DIMS.len / 2, `x in desk for n=${n}`);
      assert.ok(Math.abs(s.y) < DESK.h / 2 - 20, `y in desk for n=${n}`);
    }
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      assert.ok(Math.hypot(sp[i].x - sp[j].x, sp[i].y - sp[j].y) > PEN_DIMS.len * 1.5, `pens ${i},${j} spaced for n=${n}`);
    }
  }
});

test('layout: objects are deterministic per seed and clear of the pens', () => {
  assert.deepEqual(objectLayout(7), objectLayout(7));
  assert.notDeepEqual(objectLayout(7), objectLayout(8));
  for (let seed = 1; seed <= 40; seed++) {
    for (let n = 2; n <= 6; n++) {
      const arena = buildArena(Array.from({ length: n }, (_, i) => ({ id: `p${i}`, type: 'human' })), seed);
      for (const o of arena.objects) for (const p of arena.pens) {
        assert.ok(Math.hypot(o.x - p.x, o.y - p.y) > 75, `object ${o.id} clear of pen ${p.id} (seed ${seed}, n ${n})`);
      }
    }
  }
});
