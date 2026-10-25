// Versioned, validated local save data. Never throws: missing, corrupted, outdated or unavailable
// storage all fall back to safe defaults (and to in-memory storage if localStorage is blocked).

import {
  DEFAULT_LANG, LANGS, SERIES, SHOT_CLOCKS, AI_LEVELS, QUALITIES, CAMERA_MODES, VIEWS, PLAYER_COLORS,
} from '../config/constants.js';
import { DEFAULT_PEN, isPenId } from '../config/pens.js';
import { sanitizeName, sanitizeColor } from '../game/MatchConfig.js';

export const SAVE_KEY = 'penfighter.save';
export const SAVE_VERSION = 1;

const emptyBucket = () => ({ matchesPlayed: 0, matchesWon: 0, roundsWon: 0 });

export function defaultSave() {
  return {
    version: SAVE_VERSION,
    profile: { name: 'Player', color: PLAYER_COLORS[0], penId: DEFAULT_PEN },
    settings: {
      sound: true, view: '2d', series: 3, shotClock: 20, camera: 'auto', quality: 'medium',
      lang: DEFAULT_LANG, aiLevel: 'medium',
    },
    setup: { playerCount: 2, aiCount: 1, aiLevel: 'medium' },
    // Local stats come from matches played on this device. Online stats are server-reported
    // results, kept separate so they are never mixed with local ones.
    stats: { local: emptyBucket(), online: emptyBucket() },
  };
}

const pickEnum = (v, list, fallback) => (list.includes(v) ? v : fallback);
const nonNegInt = (v) => (Number.isFinite(v) && v >= 0 ? Math.min(Math.floor(v), 1e9) : 0);

function sanitizeBucket(b) {
  const o = b && typeof b === 'object' ? b : {};
  return { matchesPlayed: nonNegInt(o.matchesPlayed), matchesWon: nonNegInt(o.matchesWon), roundsWon: nonNegInt(o.roundsWon) };
}

/** Migration chain: each step upgrades one version. Unknown/old shapes are rebuilt field by field. */
export function migrate(raw) {
  if (!raw || typeof raw !== 'object') return defaultSave();
  // v0 (no version field) kept flat fields like { name, sound }; carry over what we recognise.
  if (!('version' in raw)) {
    raw = {
      version: 1,
      profile: { name: raw.name, color: raw.color, penId: raw.penId },
      settings: { sound: raw.sound, view: raw.view, lang: raw.lang },
      stats: { local: { matchesPlayed: raw.matchesPlayed, matchesWon: raw.matchesWon, roundsWon: raw.roundsWon } },
    };
  }
  return sanitize(raw);
}

export function sanitize(raw) {
  const d = defaultSave();
  const r = raw && typeof raw === 'object' ? raw : {};
  const p = r.profile && typeof r.profile === 'object' ? r.profile : {};
  const s = r.settings && typeof r.settings === 'object' ? r.settings : {};
  const u = r.setup && typeof r.setup === 'object' ? r.setup : {};
  const st = r.stats && typeof r.stats === 'object' ? r.stats : {};
  return {
    version: SAVE_VERSION,
    profile: {
      name: sanitizeName(p.name, d.profile.name),
      color: sanitizeColor(p.color, d.profile.color),
      penId: isPenId(p.penId) ? p.penId : d.profile.penId,
    },
    settings: {
      sound: typeof s.sound === 'boolean' ? s.sound : d.settings.sound,
      view: pickEnum(s.view, VIEWS, d.settings.view),
      series: pickEnum(Number(s.series), SERIES, d.settings.series),
      shotClock: pickEnum(Number(s.shotClock), SHOT_CLOCKS, d.settings.shotClock),
      camera: pickEnum(s.camera, CAMERA_MODES, d.settings.camera),
      quality: pickEnum(s.quality, QUALITIES, d.settings.quality),
      lang: pickEnum(s.lang, LANGS, d.settings.lang),
      aiLevel: pickEnum(s.aiLevel, AI_LEVELS, d.settings.aiLevel),
    },
    setup: {
      playerCount: Math.min(6, Math.max(2, Math.floor(Number(u.playerCount)) || d.setup.playerCount)),
      aiCount: Math.min(5, Math.max(0, Number.isFinite(Number(u.aiCount)) ? Math.floor(Number(u.aiCount)) : d.setup.aiCount)),
      aiLevel: pickEnum(u.aiLevel, AI_LEVELS, d.setup.aiLevel),
    },
    stats: { local: sanitizeBucket(st.local), online: sanitizeBucket(st.online) },
  };
}

function safeStorage() {
  try {
    const ls = globalThis.localStorage;
    if (!ls) throw new Error('none');
    const k = '__pf_test__';
    ls.setItem(k, '1');
    ls.removeItem(k);
    return ls;
  } catch {
    const mem = new Map();
    return {
      getItem: (k) => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => { mem.set(k, String(v)); },
      removeItem: (k) => { mem.delete(k); },
      isMemory: true,
    };
  }
}

export class SaveManager {
  constructor(storage = safeStorage()) {
    this.storage = storage;
    this.data = this.load();
  }

  load() {
    let parsed = null;
    try {
      const txt = this.storage.getItem(SAVE_KEY);
      parsed = txt ? JSON.parse(txt) : null;
    } catch {
      parsed = null;
    }
    this.data = migrate(parsed);
    return this.data;
  }

  save() {
    try {
      this.storage.setItem(SAVE_KEY, JSON.stringify(this.data));
      return true;
    } catch {
      return false;
    }
  }

  get() { return this.data; }

  /** Mutate via callback; the result is re-validated before it is stored. */
  update(fn) {
    const draft = JSON.parse(JSON.stringify(this.data));
    fn(draft);
    this.data = sanitize(draft);
    this.save();
    return this.data;
  }

  resetSettings() {
    this.update((d) => { d.settings = defaultSave().settings; d.setup = defaultSave().setup; });
  }

  resetStats() {
    this.update((d) => { d.stats = defaultSave().stats; });
  }

  /** Records one finished match. scope: 'local' (this device) or 'online' (server-reported). */
  recordMatch({ scope, won, roundsWon }) {
    const key = scope === 'online' ? 'online' : 'local';
    this.update((d) => {
      const b = d.stats[key];
      b.matchesPlayed += 1;
      if (won) b.matchesWon += 1;
      b.roundsWon += nonNegInt(roundsWon);
    });
  }
}
