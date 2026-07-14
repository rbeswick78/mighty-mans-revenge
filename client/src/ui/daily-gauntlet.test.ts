import { describe, expect, it } from 'vitest';
import { GameModeType, type MatchResult } from '@shared/types/game.js';
import {
  dailyGauntletProgressForKey,
  dailyGauntletProgressLabel,
  dailyGauntletStandingLabel,
  dailyGauntletProgressUpdate,
  normalizeDailyGauntletProgress,
  type DailyGauntletProgress,
} from './daily-gauntlet.js';

function dailyResult(
  challengeKey: string,
  outcome: 'advanced' | 'failed' | 'cleared',
  runScore = 0,
): MatchResult {
  return {
    matchId: 'daily',
    winnerId: outcome === 'failed' ? 'bot' : 'human',
    playerStats: new Map(),
    duration: 20,
    gameMode: GameModeType.DEATHMATCH,
    awards: [],
    rivalry: null,
    rivalrySet: null,
    isPractice: true,
    nextMapName: 'Scrapyard',
    nextGameMode: GameModeType.GUN_GAME,
    wentToOvertime: false,
    gauntlet: {
      stage: outcome === 'cleared' ? 3 : 1,
      totalStages: 3,
      difficulty: outcome === 'cleared' ? 'warlord' : 'rookie',
      runScore,
      challengeKey,
      outcome,
      stageScore: outcome === 'failed' ? 0 : runScore,
      contractBonus: 0,
      regulationBonus: 0,
      flawlessBonus: 0,
      paceBonus: 0,
      nextStage: outcome === 'advanced' ? 2 : 1,
      nextDifficulty: outcome === 'advanced' ? 'scrapper' : 'rookie',
    },
  };
}

const EMPTY: DailyGauntletProgress = {
  challengeKey: '',
  bestScore: 0,
  lastClearKey: null,
  streak: 0,
};

describe('daily Gauntlet progress', () => {
  it('normalizes malformed storage and resets the visible best on a new day', () => {
    expect(normalizeDailyGauntletProgress('{bad')).toEqual(EMPTY);
    expect(
      normalizeDailyGauntletProgress(
        JSON.stringify({
          challengeKey: '2026-07-12',
          bestScore: 6300.9,
          lastClearKey: '2026-07-12',
          streak: 4.8,
        }),
      ),
    ).toEqual({
      challengeKey: '2026-07-12',
      bestScore: 6300,
      lastClearKey: '2026-07-12',
      streak: 4,
    });
    expect(
      dailyGauntletProgressForKey(
        { challengeKey: '2026-07-12', bestScore: 6300, lastClearKey: '2026-07-12', streak: 4 },
        '2026-07-13',
      ),
    ).toMatchObject({ challengeKey: '2026-07-13', bestScore: 0, streak: 4 });
  });

  it('banks only completed clears and increments a consecutive UTC-day streak once', () => {
    const yesterday = {
      challengeKey: '2026-07-12',
      bestScore: 6000,
      lastClearKey: '2026-07-12',
      streak: 3,
    } satisfies DailyGauntletProgress;
    expect(dailyGauntletProgressUpdate(dailyResult('2026-07-13', 'advanced', 2200), yesterday))
      .toMatchObject({ isNewBest: false, isFirstClear: false, progress: { bestScore: 0, streak: 3 } });

    const clear = dailyGauntletProgressUpdate(
      dailyResult('2026-07-13', 'cleared', 6800),
      yesterday,
    );
    expect(clear).toEqual({
      isNewBest: true,
      isFirstClear: true,
      progress: {
        challengeKey: '2026-07-13',
        bestScore: 6800,
        lastClearKey: '2026-07-13',
        streak: 4,
      },
    });
    expect(
      dailyGauntletProgressUpdate(dailyResult('2026-07-13', 'cleared', 6500), clear.progress),
    ).toMatchObject({
      isNewBest: false,
      isFirstClear: false,
      progress: { bestScore: 6800, streak: 4 },
    });
  });

  it('starts a fresh streak after a missed day and renders a compact target', () => {
    const update = dailyGauntletProgressUpdate(dailyResult('2026-07-13', 'cleared', 7000), {
      challengeKey: '2026-07-10',
      bestScore: 6900,
      lastClearKey: '2026-07-10',
      streak: 8,
    });
    expect(update.progress.streak).toBe(1);
    expect(dailyGauntletProgressLabel(update.progress, true)).toBe(
      'NEW DAILY BEST: 7,000  //  STREAK: 1',
    );
    expect(dailyGauntletStandingLabel(update.progress, true, 2, 7000)).toBe(
      'NEW DAILY BEST: 7,000  //  RANK #2  //  STREAK: 1',
    );
    expect(dailyGauntletStandingLabel(update.progress, true, undefined, undefined)).toBe(
      'NEW DAILY BEST: 7,000  //  STREAK: 1',
    );
  });
});
