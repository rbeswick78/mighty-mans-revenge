import { describe, expect, it } from 'vitest';
import { rumbleGrudgeBriefingLabel, rumbleGrudgeResultLabel } from './rumble-grudge.js';

describe('Rumble grudge presentation', () => {
  it('sets a personal result target and carries plural knockout copy', () => {
    const grudge = { targetId: 'rival', targetNickname: 'Dust Queen', knockouts: 3 };
    expect(rumbleGrudgeResultLabel({ local: grudge }, 'local')).toBe(
      'GRUDGE SET: DUST QUEEN GOT YOU 3X',
    );
    expect(rumbleGrudgeBriefingLabel(grudge)).toBe(
      'GRUDGE: HUNT DUST QUEEN \u00b7 3 KOS LAST ROUND',
    );
  });

  it('uses singular copy and safely clips long or blank names', () => {
    expect(
      rumbleGrudgeBriefingLabel({
        targetId: 'rival',
        targetNickname: 'Long Named Wastelander',
        knockouts: 1,
      }),
    ).toBe('GRUDGE: HUNT LONG NAMED WASTE \u00b7 1 KO LAST ROUND');
    expect(
      rumbleGrudgeBriefingLabel({ targetId: 'rival', targetNickname: '   ', knockouts: 1 }),
    ).toBe('GRUDGE: HUNT A FIGHTER \u00b7 1 KO LAST ROUND');
  });

  it('suppresses missing, malformed, or self-authored result grudges', () => {
    expect(rumbleGrudgeResultLabel(undefined, 'local')).toBeNull();
    expect(
      rumbleGrudgeResultLabel(
        { local: { targetId: 'rival', targetNickname: 'Rival', knockouts: 0 } },
        'local',
      ),
    ).toBeNull();
    expect(
      rumbleGrudgeResultLabel(
        { local: { targetId: 'local', targetNickname: 'Local', knockouts: 1 } },
        'local',
      ),
    ).toBeNull();
  });
});
