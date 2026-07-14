import { describe, expect, it } from 'vitest';

import { CHARACTER_IDS } from '@shared/config/game.js';
import { fighterBriefing } from './fighter-briefing.js';

describe('fighterBriefing', () => {
  it('gives every fighter one readable identity and rule line', () => {
    expect(CHARACTER_IDS.map((id) => fighterBriefing(id))).toEqual([
      {
        headline: 'MIGHTY MAN  //  X-RAY VISION',
        detail: '100 HP  //  SPEED 1.00X  //  WALL SHOTS 7S // 30S COOLDOWN',
      },
      {
        headline: 'BRUCE  //  FIRE BREATH',
        detail: '115 HP  //  SPEED 0.95X  //  WALL FIRE 1.2S // 45S COOLDOWN',
      },
      {
        headline: 'FROST WIZARD  //  FROST LOCK',
        detail: '85 HP  //  SPEED 1.08X  //  FREEZE ENEMY 2S // 30S COOLDOWN',
      },
      {
        headline: 'BUBBA  //  IRON HIDE',
        detail: '150 HP  //  SPEED 0.85X  //  HALF DAMAGE 4S // 30S COOLDOWN',
      },
      {
        headline: 'JACK  //  AXE THROW',
        detail: '100 HP  //  SPEED 1.00X  //  60 DAMAGE AXE // 12S COOLDOWN',
      },
      {
        headline: 'ROOK  //  BREACH DASH',
        detail: '95 HP  //  SPEED 1.10X  //  DASH 3 TILES, STOPS AT WALL // 8S COOLDOWN',
      },
    ]);
  });

  it('keeps every detail line within the shared briefing panel budget', () => {
    for (const id of CHARACTER_IDS) {
      expect(fighterBriefing(id).detail.length).toBeLessThanOrEqual(74);
    }
  });
});
