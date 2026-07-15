import { ARENA_SCHEDULE, GAME_MODE_ROTATION } from '@shared/config/game.js';
import { GameModeType } from '@shared/types/game.js';
import { describe, expect, it } from 'vitest';
import { normalizeArenaSchedule } from './arena-schedule.js';

const MAPS = Object.freeze(['Arena A', 'Arena B']);
const SERVER_TIME = 1_000_000;

function completeMessage(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'server:lobbyConfig',
    serverTime: SERVER_TIME,
    schedules: GAME_MODE_ROTATION.map((mode, index) => ({
      mode,
      mapName: MAPS[index % MAPS.length],
      rotationEndsAt: SERVER_TIME + 200_000,
    })),
    ...overrides,
  };
}

describe('arena schedule compatibility normalization', () => {
  it('accepts only a complete server-authored schedule and preserves its clock', () => {
    const normalized = normalizeArenaSchedule(completeMessage(), MAPS);
    expect(normalized?.serverTime).toBe(SERVER_TIME);
    expect(normalized?.schedules).toHaveLength(GAME_MODE_ROTATION.length);
    expect(normalized?.schedules[1]).toEqual({
      mode: GameModeType.KOTH,
      mapName: 'Arena B',
      rotationEndsAt: SERVER_TIME + 200_000,
    });
    expect(Object.isFrozen(normalized)).toBe(true);
    expect(Object.isFrozen(normalized?.schedules)).toBe(true);
  });

  it.each([
    ['missing message', undefined],
    ['wrong message type', { ...completeMessage(), type: 'server:welcome' }],
    ['missing server clock', completeMessage({ serverTime: undefined })],
    [
      'future clock beyond one slot',
      completeMessage({
        schedules: GAME_MODE_ROTATION.map((mode) => ({
          mode,
          mapName: 'Arena A',
          rotationEndsAt: SERVER_TIME + ARENA_SCHEDULE.ROTATION_MS + 1,
        })),
      }),
    ],
    ['partial modes', completeMessage({ schedules: [] })],
    [
      'duplicate mode',
      completeMessage({
        schedules: GAME_MODE_ROTATION.map(() => ({
          mode: GameModeType.DEATHMATCH,
          mapName: 'Arena A',
          rotationEndsAt: SERVER_TIME + 1,
        })),
      }),
    ],
    [
      'unknown arena',
      completeMessage({
        schedules: GAME_MODE_ROTATION.map((mode) => ({
          mode,
          mapName: 'Missing',
          rotationEndsAt: SERVER_TIME + 1,
        })),
      }),
    ],
    [
      'inconsistent rotation deadlines',
      completeMessage({
        schedules: GAME_MODE_ROTATION.map((mode, index) => ({
          mode,
          mapName: MAPS[index % MAPS.length],
          rotationEndsAt: SERVER_TIME + 200_000 - index,
        })),
      }),
    ],
    ['malformed force mode', completeMessage({ forcedMode: 'missing' })],
    [
      'lock outside forced mode',
      completeMessage({
        forcedMode: GameModeType.CORE_RUN,
        lockedArena: {
          mode: GameModeType.KOTH,
          mapName: 'Arena B',
          lockedAt: SERVER_TIME - 1,
          rotationEndsAt: SERVER_TIME + 1,
        },
      }),
    ],
  ])('fails closed for %s', (_name, value) => {
    expect(normalizeArenaSchedule(value, MAPS)).toBeNull();
  });

  it('accepts a server-authored forced mode and an expired-but-valid queue lock', () => {
    const normalized = normalizeArenaSchedule(
      completeMessage({
        forcedMode: GameModeType.CORE_RUN,
        lockedArena: {
          mode: GameModeType.CORE_RUN,
          mapName: 'Arena B',
          lockedAt: SERVER_TIME - ARENA_SCHEDULE.ROTATION_MS,
          rotationEndsAt: SERVER_TIME - 1,
        },
      }),
      MAPS,
    );
    expect(normalized?.forcedMode).toBe(GameModeType.CORE_RUN);
    expect(normalized?.lockedArena).toEqual({
      mode: GameModeType.CORE_RUN,
      mapName: 'Arena B',
      lockedAt: SERVER_TIME - ARENA_SCHEDULE.ROTATION_MS,
      rotationEndsAt: SERVER_TIME - 1,
    });
  });

  it('rejects client-invented or malformed lock fields with the whole snapshot', () => {
    expect(
      normalizeArenaSchedule(
        completeMessage({
          lockedArena: {
            mode: GameModeType.KOTH,
            mapName: 'Arena B',
            lockedAt: SERVER_TIME + 1,
            rotationEndsAt: SERVER_TIME + 2,
          },
        }),
        MAPS,
      ),
    ).toBeNull();
  });
});
