import { describe, expect, it } from 'vitest';
import type { LeaderboardEntry } from '@shared/types/network.js';
import {
  LEADERBOARD_NAME_MAX_CHARS,
  formatDailyGauntletLeaderboardRow,
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
    contractsCompleted: 12,
    ...overrides,
  };
}

describe('formatLeaderboardRow', () => {
  it('formats rank, uppercased name, and W/L on one line', () => {
    expect(formatLeaderboardRow(1, entry())).toBe('1. RYAN [DOG] 14W 9L 12C');
  });

  it('clips long callsigns to the panel-safe length', () => {
    const row = formatLeaderboardRow(5, entry({ nickname: 'sixteen_char_max' }));
    expect(row).toBe(`5. ${'sixteen_char_max'.toUpperCase().slice(0, LEADERBOARD_NAME_MAX_CHARS)} [DOG] 14W 9L 12C`);
    expect(row).not.toContain('SIXTEEN_CHAR_MAX');
  });

  it('handles zero records without special-casing', () => {
    expect(formatLeaderboardRow(3, entry({ nickname: 'newbie', wins: 0, losses: 0 }))).toBe(
      '3. NEWBIE [DOG] 0W 0L 12C',
    );
  });

  it('derives the cosmetic badge from completed contracts and backfills old rows', () => {
    expect(formatLeaderboardRow(2, entry({ contractsCompleted: 15 }))).toContain('[MAR]');
    expect(formatLeaderboardRow(2, entry({ contractsCompleted: undefined }))).toContain(
      '[DRF]',
    );
  });
});

describe('formatDailyGauntletLeaderboardRow', () => {
  it('renders a clipped callsign and readable server score', () => {
    expect(
      formatDailyGauntletLeaderboardRow(2, {
        nickname: 'LongWastelandName',
        score: 7250,
      }),
    ).toBe('2. LONGWAST  7,250');
  });
});
