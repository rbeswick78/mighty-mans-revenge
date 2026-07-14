import { describe, expect, it } from 'vitest';
import { rumbleCrownBriefingLabel, rumbleCrownResultPresentation } from './rumble-crown.js';

describe('Rumble Crown presentation', () => {
  it('briefs the next field on a new or established champion', () => {
    expect(rumbleCrownBriefingLabel({ holderId: 'a', holderNickname: 'Alpha', wins: 1 })).toBe(
      'CROWN: ALPHA · NEW CHAMPION',
    );
    expect(rumbleCrownBriefingLabel({ holderId: 'a', holderNickname: 'Alpha', wins: 3 })).toBe(
      'CROWN: ALPHA · 3-WIN REIGN',
    );
    expect(rumbleCrownBriefingLabel(undefined)).toBeNull();
  });

  it('tells a crown steal as a two-fighter story', () => {
    expect(
      rumbleCrownResultPresentation(
        {
          crown: { holderId: 'b', holderNickname: 'Bravo', wins: 1 },
          outcome: 'stolen',
          previousHolderId: 'a',
          previousHolderNickname: 'Alpha',
        },
        'b',
      ),
    ).toEqual({ text: 'BRAVO STEALS THE CROWN FROM ALPHA', localOwnsCrown: true });
  });

  it('keeps the champion through a draw and handles an empty crown', () => {
    expect(
      rumbleCrownResultPresentation(
        {
          crown: { holderId: 'a', holderNickname: 'Alpha', wins: 2 },
          outcome: 'held',
          previousHolderId: 'a',
          previousHolderNickname: 'Alpha',
        },
        'b',
      ),
    ).toEqual({ text: 'DRAW · ALPHA KEEPS THE CROWN', localOwnsCrown: false });
    expect(
      rumbleCrownResultPresentation(
        {
          crown: null,
          outcome: 'unclaimed',
          previousHolderId: null,
          previousHolderNickname: null,
        },
        'b',
      )?.text,
    ).toBe('DRAW · THE CROWN REMAINS UNCLAIMED');
  });
});
