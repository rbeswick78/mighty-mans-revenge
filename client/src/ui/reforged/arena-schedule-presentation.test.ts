import { GAME_MODE_ROTATION } from '@shared/config/game.js';
import { GameModeType } from '@shared/types/game.js';
import { describe, expect, it } from 'vitest';
import type { NormalizedArenaSchedule } from '../../network/arena-schedule.js';
import { playSchedulePresentation } from './arena-schedule-presentation.js';

const MAPS = Object.freeze(['Arena A', 'Arena B', 'Arena C']);
const CAPABILITIES = Object.freeze({
  newShell: true,
  schedules: true,
  largeWorlds: false,
  modernArt: false,
  battleRoyale: false,
});

function schedule(): NormalizedArenaSchedule {
  return Object.freeze({
    serverTime: 1_000_000,
    schedules: Object.freeze(
      GAME_MODE_ROTATION.map((mode, index) =>
        Object.freeze({
          mode,
          mapName: MAPS[index % MAPS.length]!,
          rotationEndsAt: 1_240_250,
        }),
      ),
    ),
    forcedMode: null,
    lockedArena: null,
  });
}

describe('Play scheduled arena presentation', () => {
  it('retains the established fixed preview when schedules are not authoritative', () => {
    const presentation = playSchedulePresentation(
      { ...CAPABILITIES, schedules: false },
      schedule(),
      MAPS,
    );
    expect(presentation.availability.currentArenaByMode.deathmatch).toBe('Arena A');
    expect(presentation.arenaStatusByMode).toEqual({});
  });

  it('displays server outcomes and formats only the authoritative clock delta', () => {
    const presentation = playSchedulePresentation(CAPABILITIES, schedule(), MAPS);
    expect(presentation.availability.currentArenaByMode.koth).toBe('Arena B');
    expect(presentation.arenaStatusByMode.koth).toBe('ROTATES IN 4:01  /  SERVER CLOCK');
  });

  it('projects FORCE_MODE and a server-created queue lock without local inference', () => {
    const unlocked = schedule();
    const locked: NormalizedArenaSchedule = Object.freeze({
      ...unlocked,
      forcedMode: GameModeType.KOTH,
      lockedArena: Object.freeze({
        mode: GameModeType.KOTH,
        mapName: 'Arena C',
        rotationEndsAt: 900_000,
        lockedAt: 600_000,
      }),
    });
    const presentation = playSchedulePresentation(CAPABILITIES, locked, MAPS);
    expect(presentation.availability.currentArenaByMode).toEqual({ koth: 'Arena C' });
    expect(presentation.arenaStatusByMode).toEqual({
      koth: 'LOCKED AT QUEUE ENTRY  /  SERVER AUTHORITY',
    });
  });
});
