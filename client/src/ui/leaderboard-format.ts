import type { LeaderboardEntry } from '@shared/types/network.js';

/**
 * Max nickname characters rendered in a lobby leaderboard row. Callsigns
 * can be up to 16 chars; the panel sits in the narrow bottom-left column
 * beside the centered menu panel, so long names are clipped to keep every
 * row on one short line.
 */
export const LEADERBOARD_NAME_MAX_CHARS = 10;

/**
 * One line of the lobby's "ALL-TIME TOP 5" panel, e.g. "1. RYAN  14W 9L".
 * Pure string formatting so it stays unit-testable without Phaser.
 */
export function formatLeaderboardRow(rank: number, entry: LeaderboardEntry): string {
  const name = entry.nickname.toUpperCase().slice(0, LEADERBOARD_NAME_MAX_CHARS);
  return `${rank}. ${name}  ${entry.wins}W ${entry.losses}L`;
}
