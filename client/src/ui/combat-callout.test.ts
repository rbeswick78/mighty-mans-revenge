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
    isFirstBlood: false,
    rapidKillCount: 1,
    isPosthumous: false,
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

  it('celebrates First Blood from authoritative kill context', () => {
    expect(
      combatCalloutFor(
        entry({ isFirstBlood: true, isRevenge: true, killerStreak: 5 }),
        'local',
      ),
    ).toMatchObject({
        headline: 'FIRST BLOOD!',
        detail: 'OPENING STATEMENT',
        pulse: true,
        killSfx: { rate: 0.9, detune: -100 },
      });
  });

  it('escalates rapid chains from Double Kill through Mayhem', () => {
    expect(combatCalloutFor(entry({ rapidKillCount: 2 }), 'local')).toMatchObject({
      headline: 'DOUBLE KILL!',
    });
    expect(combatCalloutFor(entry({ rapidKillCount: 3 }), 'local')).toMatchObject({
      headline: 'TRIPLE KILL!',
    });
    expect(combatCalloutFor(entry({ rapidKillCount: 4 }), 'local')).toMatchObject({
      headline: 'MAYHEM!',
      detail: '4 RAPID KILLS',
    });
    expect(combatCalloutFor(entry({ rapidKillCount: 7 }), 'local')).toMatchObject({
      detail: '7 RAPID KILLS',
    });
  });

  it('prioritizes From the Grave over a rapid chain and First Blood', () => {
    expect(
      combatCalloutFor(
        entry({ isPosthumous: true, rapidKillCount: 3, isFirstBlood: true }),
        'local',
      ),
    ).toMatchObject({
      headline: 'FROM THE GRAVE!',
      pulse: true,
    });
  });

  it('keeps shutdown as the highest-value combat story', () => {
    expect(
      combatCalloutFor(
        entry({ victimStreakEnded: 4, isPosthumous: true, rapidKillCount: 3 }),
        'local',
      ),
    ).toMatchObject({ headline: 'SHUTDOWN!' });
  });

  it('celebrates payback when no shutdown takes priority', () => {
    expect(
      combatCalloutFor(entry({ isRevenge: true, killerStreak: 5 }), 'local'),
    ).toMatchObject({
      headline: 'PAYBACK!',
      detail: 'SCORE SETTLED',
    });
  });

  it('keeps Session 12 behavior for old events without medal fields', () => {
    const oldEvent: KillFeedEntry = {
      killerId: 'local',
      victimId: 'rival',
      weapon: 'gun',
      timestamp: 1,
      killerStreak: 3,
      victimStreakEnded: 0,
      isRevenge: false,
    };
    expect(combatCalloutFor(oldEvent, 'local')).toMatchObject({
      headline: 'RAMPAGE!',
      detail: '3 KILL STREAK',
    });
  });

  it('stays silent for remote kills and suicides', () => {
    expect(combatCalloutFor(entry(), 'someone-else')).toBeNull();
    expect(
      combatCalloutFor(entry({ killerId: 'local', victimId: 'local' }), 'local'),
    ).toBeNull();
  });
});
