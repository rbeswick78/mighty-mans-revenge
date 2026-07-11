import { describe, expect, it } from 'vitest';
import type { MatchResult } from '@shared/types/game.js';
import { formatRivalrySummary, nextDraftTeaser, rematchButtonLabel } from './rivalry-set.js';

function result(overrides: Partial<MatchResult> = {}): MatchResult {
  return {
    matchId: 'm1',
    winnerId: 'a',
    playerStats: new Map(),
    duration: 30,
    gameMode: 'deathmatch' as MatchResult['gameMode'],
    awards: [],
    rivalry: null,
    rivalrySet: {
      winsToClinch: 3,
      roundsPlayed: 2,
      players: [
        { playerId: 'a', nickname: 'Ryan', wins: 2 },
        { playerId: 'b', nickname: 'Dave', wins: 0 },
      ],
      championId: null,
    },
    nextMapName: null,
    nextGameMode: null,
    wentToOvertime: false,
    ...overrides,
  };
}

describe('rivalry-set results copy', () => {
  it('shows the current first-to-three score and revenge picker', () => {
    const value = result();
    expect(formatRivalrySummary(value)).toBe('SET R2: RYAN 2-0 DAVE  (FIRST TO 3)');
    expect(nextDraftTeaser(value)).toBe('NEXT: DAVE GETS THE REVENGE PICK');
    expect(rematchButtonLabel(value)).toBe('NEXT ROUND');
  });

  it('celebrates a clinch and labels the next consent as a new set', () => {
    const value = result({
      rivalrySet: {
        winsToClinch: 3,
        roundsPlayed: 4,
        players: [
          { playerId: 'a', nickname: 'Ryan', wins: 3 },
          { playerId: 'b', nickname: 'Dave', wins: 1 },
        ],
        championId: 'a',
      },
    });
    expect(formatRivalrySummary(value)).toBe('SET CHAMPION: RYAN  3-1');
    expect(nextDraftTeaser(value)).toBe('NEW SET: DAVE GETS THE REVENGE PICK');
    expect(rematchButtonLabel(value)).toBe('NEW SET');
  });

  it('combines the immediate set with the long-term rivalry compactly', () => {
    expect(
      formatRivalrySummary(
        result({
          rivalry: {
            nicknameA: 'Dave',
            nicknameB: 'Ryan',
            winsA: 4,
            winsB: 7,
            draws: 1,
          },
        }),
      ),
    ).toContain('|  ALL-TIME: DAVE 4-7 RYAN, 1D');
  });

  it('falls back to a coin toss after a draw or without set data', () => {
    expect(nextDraftTeaser(result({ winnerId: null }))).toContain('COIN TOSS');
    expect(nextDraftTeaser(result({ rivalrySet: null }))).toContain('COIN TOSS');
    expect(formatRivalrySummary(result({ rivalrySet: null }))).toBeNull();
  });
});
