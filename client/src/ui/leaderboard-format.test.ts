import { describe, expect, it } from 'vitest';
import type { LeaderboardEntry } from '@shared/types/network.js';
import {
  LEADERBOARD_NAME_MAX_CHARS,
  formatLeaderboardRow,
} from './leaderboard-format.js';

function entry(overrides: Partial<LeaderboardEntry> = {}): LeaderboardEntry {
  return {
    nickname: 'ryan',
    wins: 14,
    losses: 9,
    draws: 1,
    kills: 120,
    matches: 24,
    ...overrides,
  };
}

describe('formatLeaderboardRow', () => {
  it('formats rank, uppercased name, and W/L on one line', () => {
    expect(formatLeaderboardRow(1, entry())).toBe('1. RYAN  14W 9L');
  });

  it('clips long callsigns to the panel-safe length', () => {
    const row = formatLeaderboardRow(5, entry({ nickname: 'sixteen_char_max' }));
    expect(row).toBe(`5. ${'sixteen_char_max'.toUpperCase().slice(0, LEADERBOARD_NAME_MAX_CHARS)}  14W 9L`);
    expect(row).not.toContain('SIXTEEN_CHAR_MAX');
  });

  it('handles zero records without special-casing', () => {
    expect(formatLeaderboardRow(3, entry({ nickname: 'newbie', wins: 0, losses: 0 }))).toBe(
      '3. NEWBIE  0W 0L',
    );
  });
});
