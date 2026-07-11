import { describe, expect, it } from 'vitest';
import { Wasteland } from '@shared/config/palette.js';
import type { KillFeedEntry } from '@shared/types/game.js';
import { combatCalloutFor } from './combat-callout.js';

function entry(overrides: Partial<KillFeedEntry> = {}): KillFeedEntry {
  return {
    killerId: 'local',
    victimId: 'rival',
    weapon: 'gun',
    timestamp: 1,
    killerStreak: 1,
    victimStreakEnded: 0,
    isRevenge: false,
    ...overrides,
  };
}

describe('combatCalloutFor', () => {
  it('escalates local streak language at the shared thresholds', () => {
    expect(combatCalloutFor(entry({ killerStreak: 1 }), 'local')).toBeNull();
    expect(combatCalloutFor(entry({ killerStreak: 2 }), 'local')).toMatchObject({
      headline: 'ON A ROLL!',
      detail: '2 KILL STREAK',
    });
    expect(combatCalloutFor(entry({ killerStreak: 3 }), 'local')).toMatchObject({
      headline: 'RAMPAGE!',
    });
    expect(combatCalloutFor(entry({ killerStreak: 5 }), 'local')).toMatchObject({
      headline: 'UNSTOPPABLE!',
    });
  });

  it('prioritizes a shutdown over simultaneous revenge and streak copy', () => {
    expect(
      combatCalloutFor(
        entry({ killerStreak: 4, victimStreakEnded: 3, isRevenge: true }),
        'local',
      ),
    ).toEqual({
      headline: 'SHUTDOWN!',
      detail: 'ENDED A 3 KILL STREAK',
      tint: Wasteland.HIT_FLASH,
    });
  });

  it('celebrates payback when no shutdown takes priority', () => {
    expect(combatCalloutFor(entry({ isRevenge: true }), 'local')).toMatchObject({
      headline: 'PAYBACK!',
      detail: 'SCORE SETTLED',
    });
  });

  it('stays silent for remote kills and suicides', () => {
    expect(combatCalloutFor(entry(), 'someone-else')).toBeNull();
    expect(
      combatCalloutFor(entry({ killerId: 'local', victimId: 'local' }), 'local'),
    ).toBeNull();
  });
});
