import { describe, expect, it } from 'vitest';
import { winStreakPresentation } from './win-streak.js';

describe('winStreakPresentation', () => {
  it('celebrates a newly extended personal best from the second win onward', () => {
    expect(
      winStreakPresentation(
        { previous: 2, current: 3, previousBest: 2, best: 3 },
        'win',
      ),
    ).toEqual({ text: '3 WINS - NEW BEST', tone: 'new_best' });
  });

  it('shows an active streak without claiming a tied record is new', () => {
    expect(
      winStreakPresentation(
        { previous: 2, current: 3, previousBest: 5, best: 5 },
        'win',
      ),
    ).toEqual({ text: '3 WINS - BEST 5', tone: 'active' });
  });

  it('calls out a streak ended by this loss', () => {
    expect(
      winStreakPresentation(
        { previous: 4, current: 0, previousBest: 6, best: 6 },
        'loss',
      ),
    ).toEqual({ text: '4 WINS - ENDED', tone: 'ended' });
  });

  it('shows that a draw preserves an active streak', () => {
    expect(
      winStreakPresentation(
        { previous: 3, current: 3, previousBest: 5, best: 5 },
        'draw',
      ),
    ).toEqual({ text: '3 WINS - HOLDS', tone: 'active' });
  });

  it('keeps first-win and quiet states compact', () => {
    expect(
      winStreakPresentation(
        { previous: 0, current: 1, previousBest: 0, best: 1 },
        'win',
      ),
    ).toEqual({ text: '1 WIN - BEST 1', tone: 'active' });
    expect(
      winStreakPresentation(
        { previous: 0, current: 0, previousBest: 0, best: 0 },
        'loss',
      ),
    ).toEqual({ text: 'NO STREAK', tone: 'quiet' });
    expect(winStreakPresentation(undefined, 'win')).toBeNull();
  });
});
