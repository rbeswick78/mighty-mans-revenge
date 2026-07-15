import { careerRankProgressForContracts } from '@shared/config/game.js';
import type { DailyGauntletLeaderboardEntry, LeaderboardEntry } from '@shared/types/network.js';

/**
 * Max nickname characters rendered in a lobby leaderboard row. Callsigns
 * can be up to 16 chars; the panel sits in the narrow bottom-left column
 * beside the centered menu panel, so long names are clipped to keep every
 * row on one short line.
 */
export const LEADERBOARD_NAME_MAX_CHARS = 8;

/**
 * One line of the lobby's "ALL-TIME TOP 5" panel, e.g.
 * "1. RYAN [DOG] 14·9·12" (badge = reputation; the panel header names
 * the W/L/C columns). Avoid repeating three suffix letters on every row so
 * all five records remain readable inside the narrow side card.
 * Pure string formatting so it stays unit-testable without Phaser.
 */
export function formatLeaderboardRow(rank: number, entry: LeaderboardEntry): string {
  const name = entry.nickname.toUpperCase().slice(0, LEADERBOARD_NAME_MAX_CHARS);
  const contracts = entry.contractsCompleted ?? 0;
  const badge = careerRankProgressForContracts(contracts).current.badge;
  return `${rank}. ${name} [${badge}] ${entry.wins}·${entry.losses}·${contracts}`;
}

/** One compact row in the mirrored current-day score panel. */
export function formatDailyGauntletLeaderboardRow(
  rank: number,
  entry: DailyGauntletLeaderboardEntry,
): string {
  const name = entry.nickname.toUpperCase().slice(0, LEADERBOARD_NAME_MAX_CHARS);
  return `${rank}. ${name}  ${entry.score.toLocaleString('en-US')}`;
}
