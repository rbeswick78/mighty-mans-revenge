import { describe, expect, it } from 'vitest';
import { matchLeaveCopy } from './match-leave-copy.js';

describe('matchLeaveCopy', () => {
  it('makes the real-match consequence explicit', () => {
    expect(matchLeaveCopy({ matchKind: 'duel' })).toEqual({
      headline: 'FORFEIT THIS FIGHT?',
      detail: 'YOUR OPPONENT WILL TAKE THE WIN. THIS CANNOT BE UNDONE.',
    });
    expect(matchLeaveCopy({ matchKind: 'rumble' })).toEqual({
      headline: 'LEAVE THE RUMBLE?',
      detail: 'YOU WILL BE ELIMINATED. THE OTHER FIGHTERS KEEP GOING.',
    });
  });

  it('distinguishes ordinary practice, crew groups, and run progress', () => {
    expect(matchLeaveCopy({ practiceKind: 'sparring' }).headline).toBe('END PRACTICE?');
    expect(matchLeaveCopy({ practiceKind: 'crew_battle' })).toMatchObject({
      headline: 'LEAVE YOUR CREW?',
    });
    expect(matchLeaveCopy({ practiceKind: 'gauntlet' })).toMatchObject({
      headline: 'ABANDON THIS RUN?',
    });
    expect(matchLeaveCopy({ practiceKind: 'daily' })).toMatchObject({
      headline: 'ABANDON THIS RUN?',
    });
  });
});
