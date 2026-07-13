import { describe, expect, it } from 'vitest';
import type { MatchResult } from '@shared/types/game.js';
import {
  gauntletActionLabel,
  gauntletMatchLabel,
  gauntletNextTeaser,
  gauntletOutcomeTitle,
  gauntletResultSummary,
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
      outcome,
      nextStage: outcome === 'advanced' ? 2 : 1,
      nextDifficulty: outcome === 'advanced' ? 'scrapper' : 'rookie',
    },
  };
}

describe('practice gauntlet presentation', () => {
  it('labels an upcoming fight with stage, difficulty, mode, and arena', () => {
    expect(
      gauntletMatchLabel(
        { stage: 2, totalStages: 3, difficulty: 'scrapper' },
        'koth' as MatchResult['gameMode'],
        'Scrapyard',
      ),
    ).toBe('GAUNTLET 2/3 - SCRAPPER  //  KING OF THE HILL - SCRAPYARD');
  });

  it('celebrates advancement and promises the next fight', () => {
    const value = result('advanced');
    expect(gauntletOutcomeTitle(value)).toBe('STAGE CLEAR');
    expect(gauntletActionLabel(value)).toBe('NEXT FIGHT');
    expect(gauntletResultSummary(value)).toContain('STAGE CLEAR');
    expect(gauntletNextTeaser(value)).toBe(
      'NEXT: STAGE 2/3 - SCRAPPER  //  GUN GAME - SCRAPYARD',
    );
  });

  it('turns failures and full clears into explicit stage-one retries', () => {
    expect(gauntletOutcomeTitle(result('failed'))).toBe('RUN ENDED');
    expect(gauntletActionLabel(result('failed'))).toBe('RETRY RUN');
    expect(gauntletOutcomeTitle(result('cleared'))).toBe('GAUNTLET CLEAR');
    expect(gauntletNextTeaser(result('cleared'))).toContain(
      'RETRY: STAGE 1/3 - ROOKIE',
    );
  });
});
