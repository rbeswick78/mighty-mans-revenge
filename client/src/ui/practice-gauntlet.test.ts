import { describe, expect, it } from 'vitest';
import type { MatchResult } from '@shared/types/game.js';
import {
  gauntletBestClearLabel,
  gauntletBestClearUpdate,
  gauntletActionLabel,
  gauntletMatchLabel,
  gauntletNextTeaser,
  gauntletOutcomeTitle,
  gauntletResultSummary,
  gauntletStageScoreSummary,
  normalizeGauntletBestClear,
} from './practice-gauntlet.js';

function result(outcome: 'advanced' | 'failed' | 'cleared'): MatchResult {
  return {
    matchId: 'g1',
    winnerId: outcome === 'failed' ? 'bot' : 'human',
    playerStats: new Map(),
    duration: 20,
    gameMode: 'deathmatch' as MatchResult['gameMode'],
    awards: [],
    rivalry: null,
    rivalrySet: null,
    isPractice: true,
    nextMapName: 'Scrapyard',
    nextGameMode: 'gun_game' as MatchResult['gameMode'],
    wentToOvertime: false,
    gauntlet: {
      stage: outcome === 'cleared' ? 3 : 1,
      totalStages: 3,
      difficulty: outcome === 'cleared' ? 'warlord' : 'rookie',
      runScore: outcome === 'cleared' ? 4500 : outcome === 'advanced' ? 1500 : 0,
      outcome,
      stageScore: outcome === 'failed' ? 0 : 1500,
      contractBonus: outcome === 'failed' ? 0 : 300,
      regulationBonus: outcome === 'failed' ? 0 : 200,
      nextStage: outcome === 'advanced' ? 2 : 1,
      nextDifficulty: outcome === 'advanced' ? 'scrapper' : 'rookie',
    },
  };
}

describe('practice gauntlet presentation', () => {
  it('labels an upcoming fight with stage, difficulty, mode, and arena', () => {
    expect(
      gauntletMatchLabel(
        { stage: 2, totalStages: 3, difficulty: 'scrapper', runScore: 1500 },
        'koth' as MatchResult['gameMode'],
        'Scrapyard',
      ),
    ).toBe('GAUNTLET 2/3 - SCRAPPER  //  RUN 1,500  //  KING OF THE HILL - SCRAPYARD');
  });

  it('celebrates advancement and promises the next fight', () => {
    const value = result('advanced');
    expect(gauntletOutcomeTitle(value)).toBe('STAGE CLEAR');
    expect(gauntletActionLabel(value)).toBe('NEXT FIGHT');
    expect(gauntletResultSummary(value)).toContain('STAGE CLEAR');
    expect(gauntletResultSummary(value)).toContain('RUN 1,500');
    expect(gauntletStageScoreSummary(value)).toBe(
      'STAGE +1,500  //  CLEAR +1,000  //  CONTRACT +300  //  REGULATION +200',
    );
    expect(gauntletNextTeaser(value)).toBe('NEXT: STAGE 2/3 - SCRAPPER  //  GUN GAME - SCRAPYARD');
  });

  it('turns failures and full clears into explicit stage-one retries', () => {
    expect(gauntletOutcomeTitle(result('failed'))).toBe('RUN ENDED');
    expect(gauntletActionLabel(result('failed'))).toBe('RETRY RUN');
    expect(gauntletOutcomeTitle(result('cleared'))).toBe('GAUNTLET CLEAR');
    expect(gauntletNextTeaser(result('cleared'))).toContain('RETRY: STAGE 1/3 - ROOKIE');
    expect(gauntletStageScoreSummary(result('failed'))).toContain('NO POINTS BANKED');
  });

  it('normalizes and updates a browser-local best only for completed clears', () => {
    expect(normalizeGauntletBestClear(null)).toBe(0);
    expect(normalizeGauntletBestClear('oops')).toBe(0);
    expect(normalizeGauntletBestClear('4200.9')).toBe(4200);
    expect(gauntletBestClearUpdate(result('advanced'), 3000)).toEqual({
      bestScore: 3000,
      isNewBest: false,
    });
    expect(gauntletBestClearUpdate(result('cleared'), 4200)).toEqual({
      bestScore: 4500,
      isNewBest: true,
    });
    expect(gauntletBestClearUpdate(result('cleared'), 5000)).toEqual({
      bestScore: 5000,
      isNewBest: false,
    });
    expect(gauntletBestClearLabel(0)).toBe('BEST CLEAR: NONE YET');
    expect(gauntletBestClearLabel(4500, true)).toBe('NEW BEST CLEAR: 4,500');
  });
});
