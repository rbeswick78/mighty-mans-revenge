import { describe, expect, it } from 'vitest';
import type { RumbleCrownState } from '@shared/game';
import { resolveRumbleCrown } from './rumble-crown.js';

const entrants = [
  { id: 'alpha', nickname: 'Alpha' },
  { id: 'bravo', nickname: 'Bravo' },
  { id: 'charlie', nickname: 'Charlie' },
];
const connected = entrants.map((entrant) => entrant.id);
const alphaCrown: RumbleCrownState = {
  holderId: 'alpha',
  holderNickname: 'Alpha',
  wins: 2,
};

describe('resolveRumbleCrown', () => {
  it('claims the first decisive Rumble crown', () => {
    expect(resolveRumbleCrown(null, 'alpha', entrants, connected)).toEqual({
      crown: { holderId: 'alpha', holderNickname: 'Alpha', wins: 1 },
      outcome: 'claimed',
      previousHolderId: null,
      previousHolderNickname: null,
    });
  });

  it('increments a successful defense', () => {
    expect(resolveRumbleCrown(alphaCrown, 'alpha', entrants, connected)).toMatchObject({
      crown: { holderId: 'alpha', holderNickname: 'Alpha', wins: 3 },
      outcome: 'defended',
    });
  });

  it('resets the reign when another fighter steals it', () => {
    expect(resolveRumbleCrown(alphaCrown, 'bravo', entrants, connected)).toMatchObject({
      crown: { holderId: 'bravo', holderNickname: 'Bravo', wins: 1 },
      outcome: 'stolen',
      previousHolderId: 'alpha',
    });
  });

  it('preserves the crown through a draw while its holder remains', () => {
    expect(resolveRumbleCrown(alphaCrown, null, entrants, connected)).toMatchObject({
      crown: alphaCrown,
      outcome: 'held',
    });
  });

  it('clears a departed holder on a draw', () => {
    expect(resolveRumbleCrown(alphaCrown, null, entrants, ['bravo', 'charlie'])).toMatchObject({
      crown: null,
      outcome: 'unclaimed',
      previousHolderId: 'alpha',
    });
  });
});
