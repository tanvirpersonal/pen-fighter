// Match configuration validation. Used by the setup UI, the session, and the multiplayer server,
// so every entry point enforces the same rules.

import {
  MODES, SERIES, SHOT_CLOCKS, AI_LEVELS, MIN_PLAYERS, MAX_PLAYERS, NAME_MAX, PLAYER_COLORS,
} from '../config/constants.js';
import { isPenId, DEFAULT_PEN } from '../config/pens.js';

const HEX = /^#[0-9a-fA-F]{6}$/;

export function sanitizeName(raw, fallback = 'Player') {
  let s = typeof raw === 'string' ? raw : '';
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim();
  if (s.length > NAME_MAX) s = s.slice(0, NAME_MAX).trim();
  return s || fallback;
}

export function sanitizeColor(raw, fallback = PLAYER_COLORS[0]) {
  return typeof raw === 'string' && HEX.test(raw) ? raw.toUpperCase() : fallback;
}

/**
 * Validates and normalises a match config.
 * @returns {{ok: boolean, errors: string[], value: object|null}}
 */
export function validateMatchConfig(cfg) {
  const errors = [];
  if (!cfg || typeof cfg !== 'object') return { ok: false, errors: ['config'], value: null };

  const mode = cfg.mode;
  if (!MODES.includes(mode)) errors.push('mode');
  const series = Number(cfg.series);
  if (!SERIES.includes(series)) errors.push('series');
  const shotClock = Number(cfg.shotClock ?? 0);
  if (!SHOT_CLOCKS.includes(shotClock)) errors.push('shotClock');

  const players = [];
  const ids = new Set();
  const src = Array.isArray(cfg.players) ? cfg.players : [];
  if (src.length === 0 || src.length > MAX_PLAYERS + 2) errors.push('players');

  src.forEach((p, i) => {
    if (!p || typeof p !== 'object') { errors.push(`player${i}`); return; }
    const type = p.type;
    if (!['human', 'ai', 'dummy'].includes(type)) errors.push(`player${i}.type`);
    const id = typeof p.id === 'string' && /^[A-Za-z0-9_-]{1,32}$/.test(p.id) ? p.id : null;
    if (!id) errors.push(`player${i}.id`);
    else if (ids.has(id)) errors.push(`player${i}.duplicate`);
    else ids.add(id);
    if (p.penId !== undefined && !isPenId(p.penId)) errors.push(`player${i}.pen`);
    let aiLevel = p.aiLevel;
    if (type === 'ai') {
      if (!AI_LEVELS.includes(aiLevel)) errors.push(`player${i}.aiLevel`);
    } else aiLevel = undefined;
    players.push({
      id: id || `p${i}`,
      name: sanitizeName(p.name, type === 'ai' ? `CPU ${i + 1}` : type === 'dummy' ? 'Target' : `Player ${i + 1}`),
      color: sanitizeColor(p.color, PLAYER_COLORS[i % PLAYER_COLORS.length]),
      penId: isPenId(p.penId) ? p.penId : DEFAULT_PEN,
      type: ['human', 'ai', 'dummy'].includes(type) ? type : 'human',
      aiLevel,
    });
  });

  const competitors = players.filter((p) => p.type !== 'dummy');
  const humans = players.filter((p) => p.type === 'human');
  const ais = players.filter((p) => p.type === 'ai');

  if (mode === 'practice') {
    if (humans.length !== 1 || ais.length !== 0) errors.push('practice.players');
  } else {
    if (players.some((p) => p.type === 'dummy')) errors.push('dummy.notAllowed');
    if (competitors.length < MIN_PLAYERS || competitors.length > MAX_PLAYERS) errors.push('players.count');
    if (humans.length < 1) errors.push('players.noHuman');
    if (mode === 'quick' && !(humans.length === 1 && ais.length === 1)) errors.push('quick.players');
    if (mode === 'ai' && !(humans.length === 1 && ais.length >= 1)) errors.push('ai.players');
    if (mode === 'local' && ais.length !== 0) errors.push('local.noAi');
    if (mode === 'online' && ais.length !== 0) errors.push('online.noAi');
  }

  const seed = Number.isFinite(cfg.seed) ? cfg.seed >>> 0 : 1;
  const value = errors.length
    ? null
    : { mode, series, shotClock: mode === 'practice' ? 0 : shotClock, players, seed };
  return { ok: errors.length === 0, errors, value };
}
