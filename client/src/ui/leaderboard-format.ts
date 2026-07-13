import { careerRankProgressForContracts } from '@shared/config/game.js';
import type { LeaderboardEntry } from '@shared/types/network.js';

/**
 * Max nickname characters rendered in a lobby leaderboard row. Callsigns
 * can be up to 16 chars; the panel sits in the narrow bottom-left column
 * beside the centered menu panel, so long names are clipped to keep every
 * row on one short line.
 */
export const LEADERBOARD_NAME_MAX_CHARS = 8;

/**
 * One line of the lobby's "ALL-TIME TOP 5" panel, e.g.
 * "1. RYAN [DOG] 14W 9L 12C" (badge = reputation, C = contracts).
 * Pure string formatting so it stays unit-testable without Phaser.
 */
export function formatLeaderboardRow(rank: number, entry: LeaderboardEntry): string {
  const name = entry.nickname.toUpperCase().slice(0, LEADERBOARD_NAME_MAX_CHARS);
  const contracts = entry.contractsCompleted ?? 0;
  const badge = careerRankProgressForContracts(contracts).current.badge;
  return `${rank}. ${name} [${badge}] ${entry.wins}W ${entry.losses}L ${contracts}C`;
}
