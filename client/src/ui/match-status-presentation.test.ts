import { describe, expect, it } from 'vitest';
import { matchScorePresentation, matchTimerPresentation } from './match-status-presentation.js';

describe('matchScorePresentation', () => {
  it('keeps duel and team scores large and easy to scan', () => {
    expect(
      matchScorePresentation([
        { name: 'you', score: 12 },
        { name: 'Rusty', score: 9 },
      ]),
    ).toEqual({ text: 'YOU: 12  |  RUSTY: 9', fontSize: 16 });

    expect(
      matchScorePresentation([
        { name: 'Your Crew', score: 14 },
        { name: 'Rivals', score: 11 },
      ]),
    ).toEqual({ text: 'YOUR CREW: 14  |  RIVALS: 11', fontSize: 16 });
  });

  it('compacts longer free-for-all score lines without losing every identity', () => {
    expect(
      matchScorePresentation([
        { name: 'Alpha Maximum', score: 20 },
        { name: 'Bravo Maximum', score: 18 },
        { name: 'Charlie Maximum', score: 15 },
        { name: 'Delta Maximum', score: 12 },
      ]),
    ).toEqual({
      text: 'ALPHA MA: 20  ·  BRAVO MA: 18\nCHARLIE: 15  ·  DELTA MA: 12',
      fontSize: 11,
    });
  });
});

describe('matchTimerPresentation', () => {
  it('warns as the round reaches its final half-minute', () => {
    expect(matchTimerPresentation(60, false)).toEqual({ text: '1:00', tone: 'normal' });
    expect(matchTimerPresentation(29.1, false)).toEqual({ text: '0:30', tone: 'warning' });
    expect(matchTimerPresentation(9.1, false)).toEqual({ text: '0:10', tone: 'danger' });
  });

  it('prioritizes overtime and safely handles invalid time values', () => {
    expect(matchTimerPresentation(42, true)).toEqual({ text: '0:42', tone: 'overtime' });
    expect(matchTimerPresentation(Number.NaN, false)).toEqual({ text: '0:00', tone: 'danger' });
    expect(matchTimerPresentation(-10, false)).toEqual({ text: '0:00', tone: 'danger' });
  });
});
