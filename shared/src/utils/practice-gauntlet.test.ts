import { describe, expect, it } from 'vitest';
import {
  practiceGauntletMatch,
  resolvePracticeGauntlet,
} from './practice-gauntlet.js';

describe('practice gauntlet', () => {
  it('maps the three stages to escalating Rusty profiles and clamps input', () => {
    expect(practiceGauntletMatch(0)).toMatchObject({ stage: 1, difficulty: 'rookie' });
    expect(practiceGauntletMatch(Number.NaN)).toMatchObject({
      stage: 1,
      difficulty: 'rookie',
    });
    expect(practiceGauntletMatch(2)).toMatchObject({ stage: 2, difficulty: 'scrapper' });
    expect(practiceGauntletMatch(99)).toMatchObject({ stage: 3, difficulty: 'warlord' });
  });

  it('advances only on a human win, then retries after failure or a full clear', () => {
    expect(resolvePracticeGauntlet(practiceGauntletMatch(1), 'human', 'human')).toMatchObject({
      outcome: 'advanced',
      nextStage: 2,
      nextDifficulty: 'scrapper',
    });
    expect(resolvePracticeGauntlet(practiceGauntletMatch(2), 'human', null)).toMatchObject({
      outcome: 'failed',
      nextStage: 1,
      nextDifficulty: 'rookie',
    });
    expect(resolvePracticeGauntlet(practiceGauntletMatch(3), 'human', 'human')).toMatchObject({
      outcome: 'cleared',
      nextStage: 1,
      nextDifficulty: 'rookie',
    });
  });
});
