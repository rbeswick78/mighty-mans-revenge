import { describe, expect, it } from 'vitest';
import { GameModeType } from '@shared/types/game.js';
import type { ServerDraftStateMessage } from '@shared/types/network.js';
import { DRAFT } from '@shared/config/game.js';
import {
  buildHopSchedule,
  deriveDraftView,
  firstPickedCategory,
  formatDraftCountdown,
  formatRallyCountdown,
  shouldSkipSpectacle,
} from './draft-logic.js';

function snap(overrides: Partial<ServerDraftStateMessage> = {}): ServerDraftStateMessage {
  return {
    type: 'server:draftState',
    matchId: 'match-1',
    players: [
      { id: 'p1', nickname: 'ryan' },
      { id: 'p2', nickname: 'dave' },
    ],
    firstPickerId: 'p1',
    firstPickerReason: 'coin_toss',
    currentPickerId: 'p1',
    mapPick: null,
    modePick: null,
    mapOptions: ['Wasteland Outpost', 'Overgrown Suburb', 'Scrapyard'],
    modeOptions: [
      GameModeType.DEATHMATCH,
      GameModeType.KOTH,
      GameModeType.GUN_GAME,
      GameModeType.LAST_STAND,
      GameModeType.KILL_CONFIRMED,
      GameModeType.ONE_IN_THE_CHAMBER,
      GameModeType.CORE_RUN,
      GameModeType.BOUNTY_HUNT,
    ],
    pickDeadlineMs: 20000,
    ...overrides,
  };
}

describe('deriveDraftView', () => {
  it('offers both categories to the first picker before any pick', () => {
    const view = deriveDraftView(snap(), 'p1', null);
    expect(view.yourTurn).toBe(true);
    expect(view.enabledCategories).toEqual(['map', 'mode']);
    expect(view.statusLine).toBe('YOUR PICK - CHOOSE A MAP OR A MODE');
    expect(view.mapBadge).toBeNull();
    expect(view.modeBadge).toBeNull();
    expect(view.complete).toBe(false);
  });

  it('offers nothing while the opponent is choosing', () => {
    const view = deriveDraftView(snap(), 'p2', null);
    expect(view.yourTurn).toBe(false);
    expect(view.enabledCategories).toEqual([]);
    expect(view.statusLine).toBe('RYAN IS CHOOSING...');
  });

  it('offers only MAP once the mode is taken, with the mode badge attributed to the first picker', () => {
    const view = deriveDraftView(
      snap({ modePick: GameModeType.KOTH, currentPickerId: 'p2' }),
      'p2',
      'mode',
    );
    expect(view.yourTurn).toBe(true);
    expect(view.enabledCategories).toEqual(['map']);
    expect(view.statusLine).toBe('YOUR PICK - CHOOSE A MAP');
    expect(view.modeBadge).toBe('RYAN PICKED');
    expect(view.mapBadge).toBeNull();
  });

  it('offers only MODE once the map is taken (mirror case)', () => {
    const view = deriveDraftView(
      snap({ mapPick: 'Scrapyard', currentPickerId: 'p2' }),
      'p2',
      'map',
    );
    expect(view.enabledCategories).toEqual(['mode']);
    expect(view.statusLine).toBe('YOUR PICK - CHOOSE A MODE');
    expect(view.mapBadge).toBe('RYAN PICKED');
    expect(view.modeBadge).toBeNull();
  });

  it('attributes both badges via the firstPicked hint when the draft completes', () => {
    const view = deriveDraftView(
      snap({
        mapPick: 'Scrapyard',
        modePick: GameModeType.GUN_GAME,
        currentPickerId: null,
        pickDeadlineMs: 0,
      }),
      'p1',
      'map',
    );
    expect(view.complete).toBe(true);
    expect(view.enabledCategories).toEqual([]);
    expect(view.statusLine).toBe('PICKS LOCKED IN');
    expect(view.mapBadge).toBe('RYAN PICKED');
    expect(view.modeBadge).toBe('DAVE PICKED');
  });

  it('falls back to nickname-less badges on a completed draft with no hint', () => {
    const view = deriveDraftView(
      snap({
        mapPick: 'Scrapyard',
        modePick: GameModeType.KOTH,
        currentPickerId: null,
      }),
      'p1',
      null,
    );
    expect(view.mapBadge).toBe('LOCKED IN');
    expect(view.modeBadge).toBe('LOCKED IN');
  });

  it('treats an unknown local player id as a spectator (never your turn)', () => {
    const view = deriveDraftView(snap(), null, null);
    expect(view.yourTurn).toBe(false);
    expect(view.enabledCategories).toEqual([]);
  });

  it('lets every Rumble fighter cast one vote in the active rally phase', () => {
    const view = deriveDraftView(
      snap({
        draftKind: 'rally',
        players: [
          { id: 'p1', nickname: 'ryan' },
          { id: 'p2', nickname: 'dave' },
          { id: 'p3', nickname: 'cora' },
        ],
        currentPickerId: null,
        rallyCategory: 'map',
        rallyVotes: [{ playerId: 'p2', value: 'Scrapyard' }],
      }),
      'p1',
      null,
    );
    expect(view).toMatchObject({
      isRally: true,
      yourTurn: true,
      enabledCategories: ['map'],
      statusLine: 'YOUR VOTE - CHOOSE A MAP',
      voteCounts: { Scrapyard: 1 },
      localVote: null,
    });
  });

  it('locks a rally ballot and reports how many fighters remain', () => {
    const view = deriveDraftView(
      snap({
        draftKind: 'rally',
        players: [
          { id: 'p1', nickname: 'ryan' },
          { id: 'p2', nickname: 'dave' },
          { id: 'p3', nickname: 'cora' },
        ],
        currentPickerId: null,
        rallyCategory: 'mode',
        mapPick: 'Scrapyard',
        rallyVotes: [
          { playerId: 'p1', value: GameModeType.KOTH },
          { playerId: 'p2', value: GameModeType.KOTH },
        ],
      }),
      'p1',
      null,
    );
    expect(view).toMatchObject({
      yourTurn: false,
      enabledCategories: [],
      statusLine: 'VOTE CAST - WAITING FOR 1 FIGHTER',
      mapBadge: 'GROUP PICK',
      voteCounts: { [GameModeType.KOTH]: 2 },
      localVote: GameModeType.KOTH,
    });
  });
});

describe('firstPickedCategory', () => {
  it('is null before any pick', () => {
    expect(firstPickedCategory(snap())).toBeNull();
  });

  it('reports the single recorded pick', () => {
    expect(firstPickedCategory(snap({ mapPick: 'Scrapyard' }))).toBe('map');
    expect(firstPickedCategory(snap({ modePick: GameModeType.KOTH }))).toBe('mode');
  });

  it('is null again once both picks are in (ambiguous)', () => {
    expect(
      firstPickedCategory(snap({ mapPick: 'Scrapyard', modePick: GameModeType.KOTH })),
    ).toBeNull();
  });
});

describe('shouldSkipSpectacle', () => {
  it('runs the spectacle on a fresh draft', () => {
    expect(shouldSkipSpectacle(snap())).toBe(false);
  });

  it('skips once any pick is recorded (late arrival)', () => {
    expect(shouldSkipSpectacle(snap({ mapPick: 'Scrapyard' }))).toBe(true);
    expect(shouldSkipSpectacle(snap({ modePick: GameModeType.KOTH }))).toBe(true);
  });

  it('skips the two-player spectacle for a group rally', () => {
    expect(shouldSkipSpectacle(snap({ draftKind: 'rally' }))).toBe(true);
  });
});

describe('buildHopSchedule', () => {
  it.each([0, 1])('lands on winner index %i', (winnerIndex) => {
    const schedule = buildHopSchedule(winnerIndex);
    expect(schedule.hops.length).toBeGreaterThanOrEqual(3);
    expect(schedule.hops[schedule.hops.length - 1].index).toBe(winnerIndex);
    expect(schedule.landMs).toBe(schedule.hops[schedule.hops.length - 1].atMs);
  });

  it('alternates contenders and decelerates (strictly growing intervals)', () => {
    const schedule = buildHopSchedule(1);
    let prevAt = 0;
    let prevInterval = 0;
    let prevIndex = 0; // highlight starts on contender 0
    for (const hop of schedule.hops) {
      const interval = hop.atMs - prevAt;
      expect(interval).toBeGreaterThan(prevInterval);
      expect(hop.index).toBe(prevIndex === 0 ? 1 : 0);
      prevAt = hop.atMs;
      prevInterval = interval;
      prevIndex = hop.index;
    }
  });

  it('stays inside the budget, leaving room for the landing beat within SPECTACLE_MS', () => {
    for (const winnerIndex of [0, 1]) {
      const budgetMs = DRAFT.SPECTACLE_MS - 700;
      const schedule = buildHopSchedule(winnerIndex, { budgetMs });
      expect(schedule.landMs).toBeLessThanOrEqual(budgetMs);
    }
  });

  it('is deterministic', () => {
    expect(buildHopSchedule(1)).toEqual(buildHopSchedule(1));
  });

  it('still lands on the winner when the budget allows barely any hops', () => {
    for (const winnerIndex of [0, 1]) {
      const schedule = buildHopSchedule(winnerIndex, { budgetMs: 90 });
      expect(schedule.hops[schedule.hops.length - 1].index).toBe(winnerIndex);
    }
  });
});

describe('formatDraftCountdown', () => {
  it('formats whole seconds', () => {
    expect(formatDraftCountdown(15000)).toBe('AUTO-PICK IN 0:15');
  });

  it('ceils partial seconds (14.2s shows as 0:15)', () => {
    expect(formatDraftCountdown(14200)).toBe('AUTO-PICK IN 0:15');
  });

  it('clamps negative remainders to 0:00', () => {
    expect(formatDraftCountdown(-500)).toBe('AUTO-PICK IN 0:00');
  });

  it('rolls into minutes past 60s', () => {
    expect(formatDraftCountdown(61000)).toBe('AUTO-PICK IN 1:01');
  });

  it('labels the same countdown as a vote deadline in a rally', () => {
    expect(formatRallyCountdown(14200)).toBe('VOTE CLOSES IN 0:15');
  });
});
