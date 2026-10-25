// Pure scoring rules. No state, no side effects.

/** Rounds needed to win a series: Single Round -> 1, Best of 3 -> 2, Best of 5 -> 3. */
export function roundsToWin(series) {
  return Math.floor(series / 2) + 1;
}

/** Win rate as an integer percentage (0 when nothing has been played). */
export function winRate(played, won) {
  if (!played || played <= 0) return 0;
  return Math.round((Math.max(0, won) / played) * 100);
}

/** True when a player with `wins` round wins has decided a series of the given length. */
export function seriesDecided(wins, series) {
  return wins >= roundsToWin(series);
}
