import { describe, expect, it } from 'vitest';
import { GameModeType, type MatchResult } from '@shared/types/game.js';
import {
  dailyGauntletChaseLabel,
  gauntletBestClearLabel,
  gauntletBestClearUpdate,
  gauntletActionLabel,
  gauntletMatchLabel,
  gauntletNextTeaser,
  gauntletOutcomeTitle,
  gauntletResultSummary,
  gauntletRouteButtonLabel,
  gauntletRouteChoices,
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
      runScore: outcome === 'cleared' ? 6600 : outcome === 'advanced' ? 2200 : 0,
      outcome,
      stageScore: outcome === 'failed' ? 0 : 2200,
      contractBonus: outcome === 'failed' ? 0 : 300,
      regulationBonus: outcome === 'failed' ? 0 : 200,
      flawlessBonus: outcome === 'failed' ? 0 : 400,
      paceBonus: outcome === 'failed' ? 0 : 300,
      nextStage: outcome === 'advanced' ? 2 : 1,
      nextDifficulty: outcome === 'advanced' ? 'scrapper' : 'rookie',
      routeOptions:
        outcome === 'advanced'
          ? [
              {
                id: 'route_a',
                mapName: 'Scrapyard',
                gameMode: 'gun_game' as MatchResult['gameMode'],
                opponentCharacterId: 'bruce',
                forecastMutatorId: 'blackout',
                boonId: 'scrap_plating',
              },
              {
                id: 'route_b',
                mapName: 'Collapsed Overpass',
                gameMode: 'last_stand' as MatchResult['gameMode'],
                opponentCharacterId: 'frost_wizard',
                forecastMutatorId: 'weapon_roulette',
                boonId: 'quick_charge',
              },
            ]
          : undefined,
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
    expect(
      gauntletMatchLabel(
        {
          stage: 2,
          totalStages: 3,
          difficulty: 'scrapper',
          runScore: 1500,
          opponentCharacterId: 'frost_wizard',
        },
        'koth' as MatchResult['gameMode'],
        'Scrapyard',
      ),
    ).toBe(
      'GAUNTLET 2/3 - SCRAPPER  //  RUN 1,500\n' +
        'KING OF THE HILL - SCRAPYARD  //  RUSTY: FROST WIZARD',
    );
    expect(
      gauntletMatchLabel(
        {
          stage: 2,
          totalStages: 3,
          difficulty: 'scrapper',
          runScore: 1500,
          opponentCharacterId: 'frost_wizard',
          forecastMutatorId: 'weapon_roulette',
          boonIds: ['scrap_plating', 'quick_charge'],
        },
        'koth' as MatchResult['gameMode'],
        'Scrapyard',
      ),
    ).toBe(
      'GAUNTLET 2/3 - SCRAPPER  //  RUN 1,500\n' +
        'KING OF THE HILL - SCRAPYARD  //  RUSTY: FROST WIZARD\n' +
        'MID-MATCH: WEAPON ROULETTE  //  BOUNTY +200\n' +
        'BUILD: ARC PLATING  //  SCRAP PLATING + QUICK CHARGE',
    );
  });

  it('celebrates advancement and invites a route choice', () => {
    const value = result('advanced');
    expect(gauntletOutcomeTitle(value)).toBe('STAGE CLEAR');
    expect(gauntletActionLabel(value)).toBe('NEXT FIGHT');
    expect(gauntletResultSummary(value)).toContain('STAGE CLEAR');
    expect(gauntletResultSummary(value)).toContain('RUN 2,200');
    value.gauntlet!.boonIds = ['scrap_plating'];
    expect(gauntletResultSummary(value)).toContain('BOONS: SCRAP PLATING');
    value.gauntlet!.boonIds = ['scrap_plating', 'quick_charge'];
    expect(gauntletResultSummary(value)).toContain(
      'BUILD: ARC PLATING  //  SCRAP PLATING + QUICK CHARGE',
    );
    expect(gauntletStageScoreSummary(value)).toBe(
      'STAGE +2,200 = CLEAR 1,000 + CONTRACT 300 + REG 200 + FLAWLESS 400 + PACE 300',
    );
    value.gauntlet!.stageScore = 2400;
    value.gauntlet!.runScore = 2400;
    value.gauntlet!.chaosBountyBonus = 200;
    expect(gauntletStageScoreSummary(value)).toBe(
      'STAGE +2,400 = CLEAR 1,000 + CONTRACT 300 + REG 200 + FLAWLESS 400 + PACE 300 + CHAOS 200',
    );
    value.gauntlet!.stageScore = 2850;
    value.gauntlet!.runScore = 2850;
    value.gauntlet!.styleBonus = 450;
    expect(gauntletStageScoreSummary(value)).toBe(
      'STAGE +2,850 = CLEAR 1,000 + CONTRACT 300 + REG 200 + FLAWLESS 400 + PACE 300 + CHAOS 200 + STYLE 450',
    );
    expect(gauntletNextTeaser(value)).toBe('CHOOSE: STAGE 2/3 - SCRAPPER');
    expect(gauntletRouteChoices(value)).toHaveLength(2);
    expect(gauntletRouteButtonLabel(gauntletRouteChoices(value)[0])).toBe(
      'ROUTE A · GUN GAME\nSCRAPYARD\nVS BRUCE\nCHAOS: BLACKOUT +200\n' +
        'BOON: SCRAP PLATING // +25 ARMOR/LIFE',
    );
    expect(gauntletRouteButtonLabel(gauntletRouteChoices(value)[1])).toBe(
      'ROUTE B · LAST STAND\nCOLLAPSED OVERPASS\nVS FROST WIZARD\n' +
        'CHAOS: WEAPON ROULETTE +200\nBOON: QUICK CHARGE // 1.5X ABILITY',
    );
  });

  it('turns failures and full clears into explicit stage-one retries', () => {
    expect(gauntletOutcomeTitle(result('failed'))).toBe('RUN ENDED');
    expect(gauntletActionLabel(result('failed'))).toBe('RETRY RUN');
    expect(gauntletOutcomeTitle(result('cleared'))).toBe('GAUNTLET CLEAR');
    expect(gauntletNextTeaser(result('cleared'))).toContain('RETRY: STAGE 1/3 - ROOKIE');
    expect(gauntletStageScoreSummary(result('failed'))).toContain('NO POINTS BANKED');
    expect(gauntletRouteChoices(result('failed'))).toEqual([]);
  });

  it('brands shared daily challenges without changing ordinary Gauntlet copy', () => {
    const daily = result('cleared');
    daily.gauntlet!.challengeKey = '2026-07-13';
    expect(
      gauntletMatchLabel(daily.gauntlet!, GameModeType.DEATHMATCH, 'Checkpoint Zero'),
    ).toContain('DAILY RUN 3/3');
    expect(gauntletResultSummary(daily)).toContain('DAILY RUN 3/3');
    expect(gauntletOutcomeTitle(daily)).toBe('DAILY CLEAR');
    expect(gauntletActionLabel(daily)).toBe('RETRY DAILY');

    daily.gauntlet!.outcome = 'advanced';
    expect(gauntletOutcomeTitle(daily)).toBe('DAILY STAGE CLEAR');
    expect(gauntletActionLabel(daily)).toBe('NEXT FIGHT');
  });

  it('turns every server-authored Daily chase state into an actionable target', () => {
    expect(dailyGauntletChaseLabel({ kind: 'set_pace' })).toBe('DAILY CHASE: SET THE FIRST SCORE');
    expect(dailyGauntletChaseLabel({ kind: 'claim_slot', projectedRank: 3 })).toBe(
      'DAILY CHASE: POST A CLEAR  //  OPEN #3',
    );
    expect(
      dailyGauntletChaseLabel(
        { kind: 'break_in', targetNickname: 'Erin', targetScore: 4001 },
        1500,
      ),
    ).toBe('DAILY CHASE: PASS ERIN  //  SCORE 4,001  //  2,501 TO GO');
    expect(
      dailyGauntletChaseLabel(
        { kind: 'catch_rival', targetNickname: 'LongWastelandName', targetScore: 7001 },
        7001,
      ),
    ).toBe('DAILY CHASE: CATCH LONGWAST  //  SCORE 7,001  //  SCORE MET - CLEAR RUN');
    expect(
      dailyGauntletChaseLabel(
        { kind: 'catch_rival', targetNickname: 'LongWastelandName', targetScore: 7001 },
        7001,
        'cleared',
      ),
    ).toBe('DAILY CHASE: CATCH LONGWAST  //  SCORE 7,001  //  TARGET BEATEN');
    expect(dailyGauntletChaseLabel({ kind: 'defend_lead', targetScore: 8001 }, 7600)).toBe(
      'DAILY CHASE: DEFEND #1  //  SCORE 8,001  //  401 TO GO',
    );
    expect(
      dailyGauntletChaseLabel({ kind: 'defend_lead', targetScore: 8001 }, 8100, 'failed'),
    ).toBe('DAILY CHASE: DEFEND #1  //  SCORE 8,001  //  SCORE MET - RETRY DAILY');
    expect(dailyGauntletChaseLabel({ kind: 'set_pace' }, 6600, 'cleared')).toBe(
      'DAILY CHASE: CLEAR POSTED',
    );

    const daily = result('advanced');
    daily.gauntlet!.challengeKey = '2026-07-13';
    daily.gauntlet!.dailyChase = {
      kind: 'catch_rival',
      targetNickname: 'Amy',
      targetScore: 3000,
    };
    expect(gauntletMatchLabel(daily.gauntlet!, GameModeType.DEATHMATCH, 'Scrapyard')).toContain(
      'DAILY CHASE: CATCH AMY  //  SCORE 3,000  //  800 TO GO',
    );
    expect(gauntletResultSummary(daily)).toContain(
      '\nDAILY CHASE: CATCH AMY  //  SCORE 3,000  //  800 TO GO',
    );
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
      bestScore: 6600,
      isNewBest: true,
    });
    expect(gauntletBestClearUpdate(result('cleared'), 7000)).toEqual({
      bestScore: 7000,
      isNewBest: false,
    });
    expect(gauntletBestClearLabel(0)).toBe('BEST CLEAR: NONE YET');
    expect(gauntletBestClearLabel(6600, true)).toBe('NEW BEST CLEAR: 6,600');
  });
});
