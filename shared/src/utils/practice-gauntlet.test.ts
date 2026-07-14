import { describe, expect, it } from 'vitest';
import {
  CHARACTER_IDS,
  GAME_MODE_ROTATION,
  MUTATORS,
  PRACTICE_GAUNTLET,
  type CharacterId,
} from '../config/game.js';
import { listMapNames } from '../maps/registry.js';
import { GameModeType, type KillFeedEntry } from '../types/game.js';
import {
  dailyChallengeKey,
  practiceDailyGauntletOpening,
  practiceDailyGauntletRng,
  practiceGauntletMatch,
  practiceGauntletChaosBounty,
  practiceGauntletMutatorChoice,
  practiceGauntletOpponentChoices,
  practiceGauntletRoutes,
  practiceGauntletStyleBonus,
  practiceGauntletStylePointsForKill,
  resolvePracticeGauntlet,
  selectPracticeGauntletRoute,
} from './practice-gauntlet.js';

function kill(overrides: Partial<KillFeedEntry> = {}): KillFeedEntry {
  return {
    killerId: 'human',
    victimId: 'bot',
    weapon: 'gun',
    timestamp: 0,
    ...overrides,
  };
}

describe('practice gauntlet', () => {
  it('derives one stable shared opening from each UTC challenge day', () => {
    expect(dailyChallengeKey(new Date('2026-07-13T23:59:59Z'))).toBe('2026-07-13');
    expect(dailyChallengeKey('not-a-date')).toBe('1970-01-01');

    const opening = practiceDailyGauntletOpening(
      '2026-07-13',
      listMapNames(),
      GAME_MODE_ROTATION,
      CHARACTER_IDS,
    );
    expect(opening).toEqual(
      practiceDailyGauntletOpening(
        '2026-07-13',
        listMapNames(),
        GAME_MODE_ROTATION,
        CHARACTER_IDS,
      ),
    );
    expect(listMapNames()).toContain(opening?.mapName);
    expect(GAME_MODE_ROTATION).toContain(opening?.gameMode);
    expect(CHARACTER_IDS).toContain(opening?.opponentCharacterId);
    expect(
      practiceDailyGauntletOpening('2026-07-13', [], GAME_MODE_ROTATION, CHARACTER_IDS),
    ).toBeNull();
  });

  it('provides a stable per-fight random stream for fair repeat attempts', () => {
    const first = practiceDailyGauntletRng('2026-07-13|1|Scrapyard|koth|rook');
    const replay = practiceDailyGauntletRng('2026-07-13|1|Scrapyard|koth|rook');
    const nextDay = practiceDailyGauntletRng('2026-07-14|1|Scrapyard|koth|rook');
    const firstSequence = [first(), first(), first(), first()];
    expect([replay(), replay(), replay(), replay()]).toEqual(firstSequence);
    expect([nextDay(), nextDay(), nextDay(), nextDay()]).not.toEqual(firstSequence);
    expect(firstSequence.every((value) => value >= 0 && value < 1)).toBe(true);
  });

  it('offers two distinct routes and safely defaults invalid selections', () => {
    const routes = practiceGauntletRoutes(
      { mapName: 'Overgrown Suburb', gameMode: GameModeType.KOTH },
      { mapName: 'Scrapyard', gameMode: GameModeType.GUN_GAME },
    );
    expect(routes).toEqual([
      { id: 'route_a', mapName: 'Overgrown Suburb', gameMode: 'koth' },
      { id: 'route_b', mapName: 'Scrapyard', gameMode: 'gun_game' },
    ]);
    expect(selectPracticeGauntletRoute(routes, 'route_b')).toEqual(routes[1]);
    expect(selectPracticeGauntletRoute(routes, 'tampered')).toEqual(routes[0]);
    expect(selectPracticeGauntletRoute(routes, undefined)).toEqual(routes[0]);
    expect(selectPracticeGauntletRoute([], 'route_a')).toBeNull();
  });

  it('omits a duplicate route when smoke pins fix both destinations', () => {
    expect(
      practiceGauntletRoutes(
        { mapName: 'Scrapyard', gameMode: GameModeType.DEATHMATCH },
        { mapName: 'Scrapyard', gameMode: GameModeType.DEATHMATCH },
      ),
    ).toEqual([{ id: 'route_a', mapName: 'Scrapyard', gameMode: 'deathmatch' }]);
  });

  it('keeps pinned destinations distinct when they offer different rivals', () => {
    expect(
      practiceGauntletRoutes(
        {
          mapName: 'Scrapyard',
          gameMode: GameModeType.DEATHMATCH,
          opponentCharacterId: 'bruce',
        },
        {
          mapName: 'Scrapyard',
          gameMode: GameModeType.DEATHMATCH,
          opponentCharacterId: 'frost_wizard',
        },
      ),
    ).toHaveLength(2);
  });

  it('keeps pinned destinations distinct when they forecast different chaos', () => {
    expect(
      practiceGauntletRoutes(
        {
          mapName: 'Scrapyard',
          gameMode: GameModeType.DEATHMATCH,
          opponentCharacterId: 'bruce',
          forecastMutatorId: 'blackout',
        },
        {
          mapName: 'Scrapyard',
          gameMode: GameModeType.DEATHMATCH,
          opponentCharacterId: 'bruce',
          forecastMutatorId: 'scrapstorm',
        },
      ),
    ).toHaveLength(2);
  });

  it('selects stable forecast events without returning blocked choices', () => {
    const pool = ['blackout', 'scrapstorm', 'vampire'] as const;
    const first = practiceGauntletMutatorChoice(pool, [], 'stage-2-route-a');
    expect(first).toBe(practiceGauntletMutatorChoice(pool, [], 'stage-2-route-a'));
    expect(pool).toContain(first);

    const next = practiceGauntletMutatorChoice(pool, [first!], 'stage-2-route-a');
    expect(next).not.toBe(first);
    expect(pool).toContain(next);
    expect(practiceGauntletMutatorChoice(pool, [...pool], 'anything')).toBeUndefined();
  });

  it('assigns every chaos event to a frozen 100, 200, or 300 point bounty tier', () => {
    const payouts = MUTATORS.POOL.map(practiceGauntletChaosBounty);
    expect(new Set(payouts)).toEqual(new Set([100, 200, 300]));
    expect(practiceGauntletChaosBounty('infinite_ammo')).toBe(100);
    expect(practiceGauntletChaosBounty('blackout')).toBe(200);
    expect(practiceGauntletChaosBounty('scrapstorm')).toBe(300);
  });

  it('scores authoritative combat highlights once per kill and caps the stage bonus', () => {
    expect(
      practiceGauntletStylePointsForKill(
        kill({ isPosthumous: true, rapidKillCount: 4, isFirstBlood: true }),
        'human',
      ),
    ).toBe(PRACTICE_GAUNTLET.STYLE_POSTHUMOUS_POINTS);
    expect(practiceGauntletStylePointsForKill(kill({ killerId: 'bot' }), 'human')).toBe(0);

    expect(
      practiceGauntletStyleBonus(
        [
          kill({ isFirstBlood: true }),
          kill({ rapidKillCount: 2 }),
          kill({ rapidKillCount: 3 }),
          kill({ rapidKillCount: 4 }),
        ],
        'human',
      ),
    ).toBe(PRACTICE_GAUNTLET.MAX_STYLE_BONUS_POINTS);

    expect(
      practiceGauntletStyleBonus(
        [
          kill({ isPosthumous: true, rapidKillCount: 4 }),
          kill({ clutchHealth: 1, isFirstBlood: true }),
          kill({ killerId: 'bot', victimId: 'human', isFirstBlood: true }),
          kill({ victimId: 'human', isFirstBlood: true }),
        ],
        'human',
      ),
    ).toBe(
      PRACTICE_GAUNTLET.STYLE_POSTHUMOUS_POINTS +
        PRACTICE_GAUNTLET.STYLE_CLUTCH_POINTS,
    );
  });

  it('offers deterministic non-repeating rivals after the current matchup', () => {
    const roster = [
      'mighty_man',
      'bruce',
      'frost_wizard',
      'bubba',
      'jack',
      'rook',
    ] satisfies CharacterId[];
    expect(practiceGauntletOpponentChoices(roster, ['mighty_man'])).toEqual([
      'bruce',
      'frost_wizard',
    ]);
    expect(practiceGauntletOpponentChoices(roster, ['mighty_man', 'frost_wizard'])).toEqual([
      'bubba',
      'jack',
    ]);
    expect(practiceGauntletOpponentChoices(roster, ['rook', 'mighty_man'])).toEqual([
      'bruce',
      'frost_wizard',
    ]);
    expect(practiceGauntletOpponentChoices([], ['mighty_man'])).toEqual([]);
    expect(practiceGauntletOpponentChoices(roster, [], Number.NaN)).toEqual([]);
  });

  it('maps the three stages to escalating Rusty profiles and clamps input', () => {
    expect(practiceGauntletMatch(0)).toMatchObject({ stage: 1, difficulty: 'rookie' });
    expect(practiceGauntletMatch(Number.NaN)).toMatchObject({
      stage: 1,
      difficulty: 'rookie',
    });
    expect(practiceGauntletMatch(2)).toMatchObject({ stage: 2, difficulty: 'scrapper' });
    expect(practiceGauntletMatch(99)).toMatchObject({ stage: 3, difficulty: 'warlord' });
    expect(practiceGauntletMatch(2, Number.POSITIVE_INFINITY).runScore).toBe(0);
    expect(practiceGauntletMatch(2, 1499.9).runScore).toBe(1499);
    expect(practiceGauntletMatch(2, 1499, '2026-07-13')).toMatchObject({
      stage: 2,
      runScore: 1499,
      challengeKey: '2026-07-13',
    });
  });

  it('advances only on a human win, then retries after failure or a full clear', () => {
    expect(resolvePracticeGauntlet(practiceGauntletMatch(1), 'human', 'human')).toMatchObject({
      outcome: 'advanced',
      stageScore: 1200,
      runScore: 1200,
      contractBonus: 0,
      regulationBonus: 200,
      flawlessBonus: 0,
      paceBonus: 0,
      nextStage: 2,
      nextDifficulty: 'scrapper',
    });
    expect(resolvePracticeGauntlet(practiceGauntletMatch(2, 1200), 'human', null)).toMatchObject({
      outcome: 'failed',
      stageScore: 0,
      runScore: 1200,
      nextStage: 1,
      nextDifficulty: 'rookie',
    });
    expect(resolvePracticeGauntlet(practiceGauntletMatch(3), 'human', 'human')).toMatchObject({
      outcome: 'cleared',
      nextStage: 1,
      nextDifficulty: 'rookie',
    });
  });

  it('banks contract, regulation, flawless, and capped pace bonuses on a win', () => {
    expect(
      resolvePracticeGauntlet(practiceGauntletMatch(2, 1500), 'human', 'human', {
        contractCompleted: true,
        deaths: 0,
        regulationSecondsRemaining: 200,
      }),
    ).toMatchObject({
      stageScore: 2200,
      runScore: 3700,
      contractBonus: 300,
      regulationBonus: 200,
      flawlessBonus: 400,
      paceBonus: 300,
    });
    expect(
      resolvePracticeGauntlet(practiceGauntletMatch(2, 1500), 'human', 'human', {
        contractCompleted: true,
        wentToOvertime: true,
        deaths: 0,
        regulationSecondsRemaining: 100,
      }),
    ).toMatchObject({
      stageScore: 1700,
      runScore: 3200,
      contractBonus: 300,
      regulationBonus: 0,
      flawlessBonus: 400,
      paceBonus: 0,
    });
    expect(
      resolvePracticeGauntlet(practiceGauntletMatch(2, 1500), 'human', 'bot', {
        contractCompleted: true,
        deaths: 0,
        regulationSecondsRemaining: 100,
      }),
    ).toMatchObject({
      stageScore: 0,
      runScore: 1500,
      contractBonus: 0,
      regulationBonus: 0,
      flawlessBonus: 0,
      paceBonus: 0,
    });
  });

  it('banks a forecast bounty only when that Gauntlet stage is won', () => {
    const forecastMatch = {
      ...practiceGauntletMatch(2, 1500),
      forecastMutatorId: 'scrapstorm' as const,
    };
    expect(
      resolvePracticeGauntlet(forecastMatch, 'human', 'human', {
        wentToOvertime: true,
        deaths: 1,
      }),
    ).toMatchObject({
      stageScore: 1300,
      runScore: 2800,
      chaosBountyBonus: 300,
    });
    expect(resolvePracticeGauntlet(forecastMatch, 'human', 'bot')).toMatchObject({
      stageScore: 0,
      runScore: 1500,
      chaosBountyBonus: 0,
    });
  });

  it('banks capped combat style only when that Gauntlet stage is won', () => {
    expect(
      resolvePracticeGauntlet(practiceGauntletMatch(2, 1500), 'human', 'human', {
        wentToOvertime: true,
        deaths: 1,
        stylePointsEarned: 425.9,
      }),
    ).toMatchObject({
      stageScore: 1425,
      runScore: 2925,
      styleBonus: 425,
    });
    expect(
      resolvePracticeGauntlet(practiceGauntletMatch(2, 1500), 'human', 'bot', {
        stylePointsEarned: 9999,
      }),
    ).toMatchObject({
      stageScore: 0,
      runScore: 1500,
      styleBonus: 0,
    });
  });

  it('floors pace seconds and requires an explicit zero-death result for flawless', () => {
    expect(
      resolvePracticeGauntlet(practiceGauntletMatch(1), 'human', 'human', {
        deaths: 1,
        regulationSecondsRemaining: 47.9,
      }),
    ).toMatchObject({
      stageScore: 1294,
      flawlessBonus: 0,
      paceBonus: 94,
    });
    expect(
      resolvePracticeGauntlet(practiceGauntletMatch(1), 'human', 'human', {
        deaths: Number.NaN,
        regulationSecondsRemaining: -10,
      }),
    ).toMatchObject({
      stageScore: 1200,
      flawlessBonus: 0,
      paceBonus: 0,
    });
  });
});
