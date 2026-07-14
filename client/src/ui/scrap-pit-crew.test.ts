import { describe, expect, it } from 'vitest';

import { SCRAP_PIT_RIVALS } from '@shared/config/game.js';
import { scrapPitCrewLabel } from './scrap-pit-crew.js';

describe('scrapPitCrewLabel', () => {
  it('teaches every server-owned rival tactic before fighter select', () => {
    const label = scrapPitCrewLabel();

    expect(label).toBe(
      'PIT CREW: RUSTY · ALL-ROUNDER  //  SCRAPJAW · LEADER HUNTER  //  CLANK · SCAVENGER\n' +
        'PIT BANTER: TAUNT THE CREW  //  THEY ANSWER',
    );
    for (const rival of SCRAP_PIT_RIVALS) {
      expect(label).toContain(rival.nickname);
      expect(label).toContain(rival.role);
    }
  });
});
