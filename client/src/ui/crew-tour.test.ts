import { describe, expect, it } from 'vitest';
import { GameModeType, type MatchResult } from '@shared/types/game.js';
import {
  EMPTY_CREW_TOUR_RECORD,
  crewTourBriefingLabel,
  crewTourButtonLabel,
  crewTourResultLabel,
  crewTourUpdate,
  normalizeCrewTourRecord,
  type CrewTourRecord,
} from './crew-tour.js';

function record(overrides: Partial<CrewTourRecord> = {}): CrewTourRecord {
  return {
    ...EMPTY_CREW_TOUR_RECORD,
    securedModes: [...EMPTY_CREW_TOUR_RECORD.securedModes],
    ...overrides,
  };
}

function result(
  matchId: string,
  gameMode: GameModeType,
  winnerTeamId: 'blue' | 'red' | null = 'blue',
): Pick<MatchResult, 'matchId' | 'matchKind' | 'gameMode' | 'winnerTeamId' | 'playerTeams'> {
  return {
    matchId,
    matchKind: 'duos',
    gameMode,
    winnerTeamId,
    playerTeams: { local: 'blue', ally: 'blue', rival: 'red' },
  };
}

describe('Crew Tour', () => {
  it('normalizes malformed, duplicated, and impossible local progress', () => {
    expect(normalizeCrewTourRecord('{nope')).toEqual(EMPTY_CREW_TOUR_RECORD);
    expect(
      normalizeCrewTourRecord(
        JSON.stringify({
          toursCompleted: 9,
          securedModes: [
            GameModeType.CORE_RUN,
            GameModeType.KOTH,
            GameModeType.KOTH,
            GameModeType.GUN_GAME,
            GameModeType.DEATHMATCH,
          ],
          wins: 6.8,
          currentWinStreak: 20,
          bestWinStreak: -4,
          lastMatchId: 42,
        }),
      ),
    ).toEqual({
      toursCompleted: 1,
      securedModes: [GameModeType.DEATHMATCH, GameModeType.KOTH],
      wins: 6,
      currentWinStreak: 6,
      bestWinStreak: 6,
      lastMatchId: null,
    });
  });

  it('collects unique objective patches and rolls a complete set into a new tour', () => {
    const first = crewTourUpdate(result('crew-1', GameModeType.DEATHMATCH), 'local', record());
    expect(first).toMatchObject({ earnedPatch: true, completedTour: false, isNewBest: true });
    expect(first?.record.securedModes).toEqual([GameModeType.DEATHMATCH]);
    expect(crewTourResultLabel(first)).toBe(
      'CREW TOUR 1/4 // KOs PATCH SECURED // RUN 1 - NEW BEST',
    );

    const duplicate = crewTourUpdate(
      result('crew-2', GameModeType.DEATHMATCH),
      'local',
      first!.record,
    );
    expect(duplicate).toMatchObject({ earnedPatch: false, completedTour: false });
    expect(duplicate?.record.securedModes).toEqual([GameModeType.DEATHMATCH]);

    const hill = crewTourUpdate(result('crew-3', GameModeType.KOTH), 'local', duplicate!.record);
    const tags = crewTourUpdate(
      result('crew-4', GameModeType.KILL_CONFIRMED),
      'local',
      hill!.record,
    );
    const core = crewTourUpdate(result('crew-5', GameModeType.CORE_RUN), 'local', tags!.record);
    expect(core).toMatchObject({ earnedPatch: true, completedTour: true, isNewBest: true });
    expect(core?.record).toMatchObject({
      toursCompleted: 1,
      securedModes: [],
      wins: 5,
      currentWinStreak: 5,
      bestWinStreak: 5,
    });
    expect(crewTourResultLabel(core)).toBe(
      'CREW TOUR #1 COMPLETE // 4 PATCHES // RUN 5 - NEW BEST',
    );
    expect(crewTourButtonLabel(core!.record)).toBe('CREW 2V2\n1 TOUR - 0/4');
  });

  it('preserves patches on draws and losses while handling the win run honestly', () => {
    const prior = record({
      securedModes: [GameModeType.DEATHMATCH, GameModeType.KOTH],
      wins: 5,
      currentWinStreak: 3,
      bestWinStreak: 3,
    });
    const draw = crewTourUpdate(
      result('crew-draw', GameModeType.KILL_CONFIRMED, null),
      'local',
      prior,
    );
    expect(draw?.record).toMatchObject({
      securedModes: prior.securedModes,
      wins: 5,
      currentWinStreak: 3,
    });
    expect(crewTourResultLabel(draw)).toBe('CREW TOUR 2/4 // RUN 3 HOLDS // BEST 3');

    const loss = crewTourUpdate(
      result('crew-loss', GameModeType.CORE_RUN, 'red'),
      'local',
      draw!.record,
    );
    expect(loss?.record).toMatchObject({ securedModes: prior.securedModes, currentWinStreak: 0 });
    expect(crewTourResultLabel(loss)).toBe('CREW TOUR 2/4 // 3-WIN RUN ENDED // BEST 3');
  });

  it('counts a result once and rejects incomplete or non-Crew authority', () => {
    const prior = record({
      securedModes: [GameModeType.KOTH],
      wins: 2,
      currentWinStreak: 2,
      bestWinStreak: 2,
      lastMatchId: 'crew-repeat',
    });
    const duplicate = crewTourUpdate(result('crew-repeat', GameModeType.KOTH), 'local', prior);
    expect(duplicate).toMatchObject({ counted: false, earnedPatch: false, record: prior });
    expect(crewTourUpdate(result('crew-new', GameModeType.KOTH), null, prior)).toBeNull();
    expect(crewTourUpdate(result('crew-new', GameModeType.GUN_GAME), 'local', prior)).toBeNull();
    expect(
      crewTourUpdate(
        { ...result('crew-new', GameModeType.KOTH), winnerTeamId: undefined },
        'local',
        prior,
      ),
    ).toBeNull();
  });

  it('surfaces current and final patch targets before a fight', () => {
    expect(crewTourButtonLabel(record())).toBe('CREW 2V2\nTOUR 0/4');
    expect(crewTourBriefingLabel(record(), GameModeType.KOTH)).toBe(
      'CREW TOUR 0/4 // HILL PATCH OPEN',
    );
    expect(
      crewTourBriefingLabel(
        record({
          securedModes: [GameModeType.DEATHMATCH, GameModeType.KOTH, GameModeType.KILL_CONFIRMED],
        }),
        GameModeType.CORE_RUN,
      ),
    ).toBe('FINAL PATCH: CORE // WIN TO COMPLETE TOUR');
    expect(
      crewTourBriefingLabel(
        record({ securedModes: [GameModeType.DEATHMATCH] }),
        GameModeType.DEATHMATCH,
      ),
    ).toBe('CREW TOUR 1/4 // KOs PATCH HELD');
  });
});
