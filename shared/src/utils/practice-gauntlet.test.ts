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

  it('banks contract and regulation bonuses only on an authoritative win', () => {
    expect(
      resolvePracticeGauntlet(practiceGauntletMatch(2, 1500), 'human', 'human', true, false),
    ).toMatchObject({
      stageScore: 1500,
      runScore: 3000,
      contractBonus: 300,
      regulationBonus: 200,
    });
    expect(
      resolvePracticeGauntlet(practiceGauntletMatch(2, 1500), 'human', 'human', true, true),
    ).toMatchObject({
      stageScore: 1300,
      runScore: 2800,
      contractBonus: 300,
      regulationBonus: 0,
    });
    expect(
      resolvePracticeGauntlet(practiceGauntletMatch(2, 1500), 'human', 'bot', true, false),
    ).toMatchObject({
      stageScore: 0,
      runScore: 1500,
      contractBonus: 0,
      regulationBonus: 0,
    });
  });
});
