import { describe, expect, it } from 'vitest';
import { practiceGauntletMatch, resolvePracticeGauntlet } from './practice-gauntlet.js';

describe('practice gauntlet', () => {
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
