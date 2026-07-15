import { describe, expect, it } from 'vitest';

import { KILL_WEAPONS } from '@shared/config/game.js';
import type { PlayerId } from '@shared/types/common.js';
import type { KillFeedEntry, KillWeapon } from '@shared/types/game.js';

import { killFeedPresentation } from './kill-feed-presentation.js';

const LOCAL = 'local' as PlayerId;
const RIVAL = 'rival' as PlayerId;
const THIRD = 'third' as PlayerId;
const names = new Map<PlayerId, string>([
  [LOCAL, 'Audit97'],
  [RIVAL, 'Rusty'],
  [THIRD, 'Long Wasteland Callsign'],
]);

function entry(killerId: PlayerId, victimId: PlayerId, weapon: KillWeapon = 'gun'): KillFeedEntry {
  return { killerId, victimId, weapon, timestamp: 1 };
}

describe('killFeedPresentation', () => {
  it('makes local kills and deaths immediately scannable', () => {
    expect(killFeedPresentation(entry(LOCAL, RIVAL), names, LOCAL)).toEqual({
      label: 'YOU [RIFLE] RUSTY',
      tone: 'local-kill',
    });
    expect(killFeedPresentation(entry(RIVAL, LOCAL, 'shotgun'), names, LOCAL)).toEqual({
      label: 'RUSTY [SHOTGUN] YOU',
      tone: 'local-death',
    });
  });

  it('keeps neutral and missing fighter names bounded', () => {
    expect(killFeedPresentation(entry(THIRD, RIVAL, 'axe'), names, LOCAL)).toEqual({
      label: 'LONG WASTE [AXE] RUSTY',
      tone: 'neutral',
    });
    expect(killFeedPresentation(entry('missing' as PlayerId, RIVAL, 'fire'), names, LOCAL)).toEqual(
      { label: 'FIGHTER [FIRE] RUSTY', tone: 'neutral' },
    );
  });

  it('labels self-eliminations without inventing another fighter', () => {
    expect(killFeedPresentation(entry(LOCAL, LOCAL, 'grenade'), names, LOCAL)).toEqual({
      label: 'YOU [GRENADE] SELF',
      tone: 'local-death',
    });
  });

  it('has concise player-facing copy for every authoritative kill source', () => {
    for (const weapon of KILL_WEAPONS) {
      const presentation = killFeedPresentation(entry(LOCAL, RIVAL, weapon), names, LOCAL);
      expect(presentation.label).toMatch(/^YOU \[[A-Z]+\] RUSTY$/);
      expect(presentation.label.length).toBeLessThanOrEqual(24);
    }
  });
});
