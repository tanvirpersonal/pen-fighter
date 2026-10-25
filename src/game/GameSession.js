// GameSession: the single source of truth for one match. Headless and renderer-agnostic.
//
// It owns the match state machine, turn order, scoring, shot clock and AI turns, and drives a
// physics world through a small interface (see PhysicsWorld.js). Both renderers only *read* from it.
// The same class runs in the browser (local play) and on the multiplayer server (online play).
//
// Phases:  ready -> aiming -> moving -> aiming ... -> roundEnd -> (aiming ...) -> matchEnd
//
// Documented rules:
//  * A pen is eliminated when its centre leaves the desk rectangle. Eliminations are resolved only
//    after every body has settled, so a winner is never declared while something is still moving.
//  * Last surviving pen wins the round. If all remaining pens fall in the same shot the round is a
//    draw: nobody scores, and the round is replayed (the round number does not advance).
//  * Series: Single Round = 1 win, Best of 3 = 2 wins, Best of 5 = 3 wins.
//  * Shot-clock timeout skips the turn. If every surviving player skips twice in a row the round is
//    a draw (stalemate), so a match can never hang.
//  * Practice mode never scores; fallen pens and targets are put back after every shot.

import { PHYS } from '../config/constants.js';
import { roundsToWin } from './Scoring.js';
import { validateMatchConfig } from './MatchConfig.js';
import { buildArena } from '../physics/layout.js';
import { makeRng } from './rng.js';
import { chooseShot, thinkTime } from '../ai/AIController.js';

const MAX_FRAME_MS = 100;
const MAX_STEPS_PER_UPDATE = 6;

export class GameSession {
  /**
   * @param {object} config validated via validateMatchConfig
   * @param {{createPhysics: () => object, rng?: () => number}} deps
   */
  constructor(config, deps) {
    const v = validateMatchConfig(config);
    if (!v.ok) throw new Error(`Invalid match config: ${v.errors.join(', ')}`);
    this.cfg = v.value;
    this.mode = this.cfg.mode;
    this.practice = this.mode === 'practice';
    this.series = this.cfg.series;
    this.toWin = roundsToWin(this.series);
    this.createPhysics = deps.createPhysics;
    this.rng = deps.rng || makeRng(this.cfg.seed ^ 0x5bd1e995);

    this.players = this.cfg.players.map((p, seat) => ({
      ...p, seat, wins: 0, alive: true, forfeited: false,
    }));
    this.physics = null;
    this.listeners = new Map();
    this.destroyed = false;

    this.phase = 'ready';
    this.paused = false;
    this.clockPaused = false;
    this.roundsDecided = 0;
    this.drawCount = 0;
    this.roundsStarted = 0;
    this.round = 1;
    this.turnId = null;
    this.clockLeft = this.cfg.shotClock > 0 ? this.cfg.shotClock : null;
    this.roundResult = null;
    this.matchResult = null;
    this.shots = 0;
    this.consecutiveSkips = 0;
    this._acc = 0;
    this._aiTimer = 0;
    this._aiThink = 0;
    this._spawnSpecs = [];
  }

  // ---- events -------------------------------------------------------------------------------

  on(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
    return () => this.listeners.get(type)?.delete(fn);
  }

  _emit(type, payload = {}) {
    const set = this.listeners.get(type);
    if (set) for (const fn of [...set]) fn(payload);
    const any = this.listeners.get('*');
    if (any) for (const fn of [...any]) fn({ type, ...payload });
  }

  // ---- lifecycle ----------------------------------------------------------------------------

  start() {
    if (this.phase !== 'ready') return false;
    this._startRound();
    return true;
  }

  /** Fresh match with the same setup. Valid at any time for local play; online is host-driven. */
  rematch() {
    if (this.destroyed) return false;
    for (const p of this.players) { p.wins = 0; p.alive = true; p.forfeited = false; }
    this.roundsDecided = 0;
    this.drawCount = 0;
    this.roundsStarted = 0;
    this.shots = 0;
    this.matchResult = null;
    this.roundResult = null;
    this.paused = false;
    this._startRound();
    this._emit('rematch');
    return true;
  }

  nextRound() {
    if (this.phase !== 'roundEnd') return false;
    this._startRound();
    return true;
  }

  /**
   * Re-run the round that just ended without scoring it.
   * A drawn round is always replayable. A decided round can be replayed in local modes only; its
   * point is taken back. Online matches only allow replaying draws.
   */
  replayRound() {
    if (this.phase !== 'roundEnd' || !this.roundResult) return false;
    if (this.roundResult.winnerId) {
      if (this.mode === 'online') return false;
      const w = this.players.find((p) => p.id === this.roundResult.winnerId);
      if (w && w.wins > 0) w.wins--;
      this.roundsDecided = Math.max(0, this.roundsDecided - 1);
    }
    this._startRound();
    return true;
  }

  setPaused(p) { this.paused = !!p; }
  setClockPaused(p) { this.clockPaused = !!p; }

  destroy() {
    this.destroyed = true;
    this.listeners.clear();
    if (this.physics) { this.physics.destroy(); this.physics = null; }
  }

  // ---- queries ------------------------------------------------------------------------------

  get current() {
    return this.players.find((p) => p.id === this.turnId) || null;
  }

  snapshot() {
    return this.physics ? this.physics.snapshot() : { pens: [], objs: [] };
  }

  /** Plain-data state for HUDs, the network and tests. */
  getState() {
    return {
      mode: this.mode,
      phase: this.phase,
      paused: this.paused,
      series: this.series,
      toWin: this.toWin,
      round: this.round,
      shotClock: this.cfg.shotClock,
      clockLeft: this.clockLeft,
      turnId: this.turnId,
      roundResult: this.roundResult ? { ...this.roundResult } : null,
      matchResult: this.matchResult ? { ...this.matchResult, wins: { ...this.matchResult.wins } } : null,
      players: this.players.map((p) => ({
        id: p.id, name: p.name, color: p.color, penId: p.penId, type: p.type, aiLevel: p.aiLevel,
        seat: p.seat, wins: p.wins, alive: p.alive, forfeited: p.forfeited,
      })),
    };
  }

  _competitors() {
    return this.players.filter((p) => p.type !== 'dummy' && !p.forfeited);
  }

  _aliveCompetitors() {
    return this._competitors().filter((p) => p.alive);
  }

  // ---- round flow ---------------------------------------------------------------------------

  _startRound() {
    this.round = this.roundsDecided + 1;
    this.roundsStarted++;
    this.roundResult = null;
    this.consecutiveSkips = 0;
    this._acc = 0;
    for (const p of this.players) p.alive = !p.forfeited;

    const penPlayers = this.players.filter((p) => !p.forfeited);
    const seed = (this.cfg.seed + this.roundsStarted * 7919) >>> 0;
    const arena = buildArena(penPlayers, seed, this.practice);
    this._spawnSpecs = arena.pens;
    if (!this.physics) this.physics = this.createPhysics();
    this.physics.reset(arena);

    const comps = this._competitors();
    const first = comps[(this.roundsStarted - 1) % comps.length];
    this.phase = 'aiming';
    this._emit('roundStart', { round: this.round });
    this._setTurn(first ? first.id : null);
  }

  _setTurn(id) {
    this.turnId = id;
    this.clockLeft = this.cfg.shotClock > 0 ? this.cfg.shotClock : null;
    const cur = this.current;
    this._aiTimer = 0;
    this._aiThink = cur && cur.type === 'ai' ? thinkTime(cur.aiLevel, this.rng) : 0;
    this._emit('turn', { playerId: id });
  }

  _nextAlive(afterId) {
    const comps = this._competitors();
    if (comps.length === 0) return null;
    // idx is -1 when `afterId` has just forfeited; the loop then starts from the first seat.
    const idx = comps.findIndex((p) => p.id === afterId);
    const n = comps.length;
    for (let i = 1; i <= n; i++) {
      const cand = comps[(((idx + i) % n) + n) % n];
      if (cand.alive) return cand;
    }
    return null;
  }

  // ---- input --------------------------------------------------------------------------------

  /**
   * Fire the current player's pen. Returns {ok:true} or {ok:false, error}.
   * Validation is identical for humans, AI and network clients.
   */
  shoot(playerId, angle, power) {
    if (this.destroyed) return { ok: false, error: 'destroyed' };
    if (this.phase !== 'aiming') return { ok: false, error: 'wrong_phase' };
    if (this.paused) return { ok: false, error: 'paused' };
    if (playerId !== this.turnId) return { ok: false, error: 'not_your_turn' };
    const p = this.current;
    if (!p || !p.alive || p.forfeited || p.type === 'dummy') return { ok: false, error: 'cannot_act' };
    if (!Number.isFinite(angle) || !Number.isFinite(power)) return { ok: false, error: 'bad_value' };
    if (power < 0 || power > 1.0001) return { ok: false, error: 'bad_power' };
    const pw = Math.min(1, power);

    if (!this.physics.shoot(p.id, angle, pw)) return { ok: false, error: 'cannot_act' };
    this.phase = 'moving'; // set before emitting so a second shoot() in the same turn is rejected
    this.shots++;
    this.consecutiveSkips = 0;
    this.clockLeft = null;
    this._acc = 0;
    this._emit('shot', { playerId: p.id, angle, power: pw });
    return { ok: true };
  }

  /** Voluntarily or by timeout: give up the turn without shooting. */
  skipTurn(reason = 'timeout') {
    if (this.phase !== 'aiming') return false;
    const cur = this.current;
    this.consecutiveSkips++;
    this._emit('turnSkipped', { playerId: cur ? cur.id : null, reason });
    const aliveCount = this._aliveCompetitors().length;
    if (aliveCount > 1 && this.consecutiveSkips >= aliveCount * 2) {
      this._endRound('stalemate');
      return true;
    }
    const next = this._nextAlive(this.turnId);
    if (next) this._setTurn(next.id);
    else this._endRound('stalemate');
    return true;
  }

  /** A player leaves for good (disconnect timeout). Their pen is removed; the match goes on. */
  forfeit(playerId) {
    const p = this.players.find((x) => x.id === playerId);
    if (!p || p.forfeited || p.type === 'dummy') return false;
    p.forfeited = true;
    p.alive = false;
    if (this.physics) this.physics.removePen(p.id);
    this._emit('forfeit', { playerId });
    if (this.phase === 'matchEnd') return true;
    const remaining = this._competitors();
    if (remaining.length <= 1) {
      this._finishMatch(remaining[0] ? remaining[0].id : null, 'forfeit');
      return true;
    }
    if (this.phase === 'aiming') {
      if (this._aliveCompetitors().length <= 1) this._endRound('forfeit');
      else if (this.turnId === playerId) this._setTurn(this._nextAlive(playerId).id);
    }
    // During 'moving' or 'roundEnd' the normal resolution below picks it up.
    return true;
  }

  // ---- simulation loop ----------------------------------------------------------------------

  /** Advance by real elapsed milliseconds. Safe to call every animation frame. */
  update(dtMs) {
    if (this.destroyed || this.paused || !this.physics) return;
    const dt = Math.min(Math.max(dtMs, 0), MAX_FRAME_MS);
    if (this.phase === 'moving') {
      this._acc += dt;
      let n = 0;
      while (this._acc >= PHYS.step && n < MAX_STEPS_PER_UPDATE && this.phase === 'moving') {
        this._stepOnce();
        this._acc -= PHYS.step;
        n++;
      }
      if (this._acc > PHYS.step * MAX_STEPS_PER_UPDATE) this._acc = 0;
    } else {
      // Not simulating: only let falling pens finish their animation.
      this._acc += dt;
      let n = 0;
      while (this._acc >= PHYS.step && n < MAX_STEPS_PER_UPDATE) {
        this.physics.tickFall();
        this._acc -= PHYS.step;
        n++;
      }
      if (this._acc > PHYS.step * MAX_STEPS_PER_UPDATE) this._acc = 0;
      if (this.phase === 'aiming') this._updateAiming(dt);
    }
  }

  _updateAiming(dt) {
    if (this.clockPaused) return;
    const cur = this.current;
    if (cur && cur.type === 'ai') {
      this._aiTimer += dt;
      if (this._aiTimer >= this._aiThink) this._takeAiTurn(cur);
      return;
    }
    if (this.clockLeft !== null) {
      this.clockLeft -= dt / 1000;
      if (this.clockLeft <= 0) { this.clockLeft = 0; this.skipTurn('timeout'); }
    }
  }

  _takeAiTurn(cur) {
    const snap = this.physics.snapshot();
    const targets = this._aliveCompetitors().filter((p) => p.id !== cur.id).map((p) => p.id);
    const shot = chooseShot(snap, cur.id, targets, cur.aiLevel, this.rng);
    const res = this.shoot(cur.id, shot.angle, shot.power);
    if (!res.ok) this.skipTurn('ai_error'); // should never happen; guarantees progress
  }

  _stepOnce() {
    const ev = this.physics.step();
    for (const f of ev.falls) {
      const pl = this.players.find((p) => p.id === f.id);
      if (pl) pl.alive = false;
      this._emit('fall', { id: f.id, kind: f.kind });
    }
    for (const h of ev.hits) this._emit('hit', h);
    if (this.physics.isSettled()) {
      if (this.physics.stepsMoving >= PHYS.maxMoveSteps) this.physics.forceSettle();
      this._resolveTurn();
    }
  }

  _resolveTurn() {
    if (this.phase !== 'moving') return;
    if (this.practice) { this._resolvePractice(); return; }
    const alive = this._aliveCompetitors();
    if (alive.length <= 1) { this._endRound('elimination'); return; }
    let next = this._nextAlive(this.turnId);
    if (!next) { this._endRound('elimination'); return; }
    this.phase = 'aiming';
    this._setTurn(next.id);
  }

  _resolvePractice() {
    const snap = this.physics.snapshot();
    const anyOut = snap.pens.some((p) => p.out);
    const allTargetsOut = this.players.filter((p) => p.type === 'dummy').every((d) => snap.pens.find((p) => p.id === d.id)?.out);
    if (anyOut || allTargetsOut) {
      this.physics.respawn(this._spawnSpecs);
      for (const p of this.players) p.alive = true;
      this._emit('practiceReset', {});
    }
    this.phase = 'aiming';
    this._setTurn(this.players.find((p) => p.type === 'human').id);
  }

  /** Practice only: manual reset button. */
  resetPractice() {
    if (!this.practice || !this.physics) return false;
    this.physics.respawn(this._spawnSpecs);
    for (const p of this.players) p.alive = true;
    this.phase = 'aiming';
    this._emit('practiceReset', {});
    this._setTurn(this.players.find((p) => p.type === 'human').id);
    return true;
  }

  _endRound(reason) {
    if (this.phase === 'roundEnd' || this.phase === 'matchEnd') return; // exactly-once guard
    const alive = this._aliveCompetitors();
    const winner = alive.length === 1 ? alive[0] : null;
    this.clockLeft = null;
    if (winner) {
      winner.wins++;
      this.roundsDecided++;
      this.roundResult = { round: this.round, winnerId: winner.id, draw: false, reason };
    } else {
      this.drawCount++;
      this.roundResult = { round: this.round, winnerId: null, draw: true, reason };
    }
    this.phase = 'roundEnd';
    this._emit('roundEnd', { ...this.roundResult });
    if (winner && winner.wins >= this.toWin) this._finishMatch(winner.id, 'series');
  }

  _finishMatch(winnerId, reason) {
    if (this.phase === 'matchEnd') return; // exactly-once guard
    this.phase = 'matchEnd';
    this.clockLeft = null;
    const wins = {};
    for (const p of this.players) if (p.type !== 'dummy') wins[p.id] = p.wins;
    this.matchResult = { winnerId, reason, wins, roundsPlayed: this.roundsDecided };
    this._emit('matchEnd', { ...this.matchResult, wins: { ...wins } });
  }
}
