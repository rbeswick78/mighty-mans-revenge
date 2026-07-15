import { ARENA_SCHEDULE, GAME_MODE_ROTATION, GameModeType } from '@shared/game';
import { describe, expect, it } from 'vitest';
import { createArenaScheduleMessage, lockScheduledArena } from './arena-schedule.js';

const MAPS = Object.freeze(['Arena A', 'Arena B', 'Arena C']);

describe('server-owned arena schedules', () => {
  it('derives every standard mode from an epoch slot with deterministic offsets', () => {
    const snapshot = createArenaScheduleMessage(
      ARENA_SCHEDULE.ROTATION_MS * 7 + 12_345,
      {},
      undefined,
      MAPS,
    );

    expect(snapshot.serverTime).toBe(2_112_345);
    expect(snapshot.schedules).toHaveLength(GAME_MODE_ROTATION.length);
    expect(snapshot.schedules.map(({ mode }) => mode)).toEqual(GAME_MODE_ROTATION);
    expect(snapshot.schedules.map(({ mapName }) => mapName)).toEqual([
      'Arena B',
      'Arena C',
      'Arena A',
      'Arena B',
      'Arena C',
      'Arena A',
      'Arena B',
      'Arena C',
    ]);
    expect(new Set(snapshot.schedules.map(({ rotationEndsAt }) => rotationEndsAt))).toEqual(
      new Set([ARENA_SCHEDULE.ROTATION_MS * 8]),
    );
  });

  it('changes only at an epoch boundary and wraps registry order', () => {
    const before = createArenaScheduleMessage(ARENA_SCHEDULE.ROTATION_MS - 1, {}, undefined, MAPS);
    const after = createArenaScheduleMessage(ARENA_SCHEDULE.ROTATION_MS, {}, undefined, MAPS);

    expect(before.schedules[0]).toMatchObject({ mapName: 'Arena A' });
    expect(after.schedules[0]).toMatchObject({ mapName: 'Arena B' });
    expect(after.schedules[2]).toMatchObject({ mapName: 'Arena A' });
  });

  it('retains valid FORCE diagnostics without accepting malformed pins', () => {
    const forced = createArenaScheduleMessage(
      123_456,
      { FORCE_MAP: 'Arena C', FORCE_MODE: GameModeType.KOTH },
      undefined,
      MAPS,
    );
    expect(new Set(forced.schedules.map(({ mapName }) => mapName))).toEqual(new Set(['Arena C']));
    expect(forced.forcedMode).toBe(GameModeType.KOTH);

    const malformed = createArenaScheduleMessage(
      123_456,
      { FORCE_MAP: 'Missing', FORCE_MODE: 'missing' },
      undefined,
      MAPS,
    );
    expect(malformed.schedules[0]?.mapName).toBe('Arena A');
    expect(malformed.forcedMode).toBeUndefined();
  });

  it('locks the displayed server outcome at queue entry across later slots', () => {
    const initial = createArenaScheduleMessage(10_000, {}, undefined, MAPS);
    const lock = lockScheduledArena(initial, GameModeType.DEATHMATCH, 10_250);
    const later = createArenaScheduleMessage(ARENA_SCHEDULE.ROTATION_MS, {}, undefined, MAPS);

    expect(lock).toEqual({
      mode: GameModeType.DEATHMATCH,
      mapName: 'Arena A',
      rotationEndsAt: ARENA_SCHEDULE.ROTATION_MS,
      lockedAt: 10_250,
    });
    expect(later.schedules[0]?.mapName).toBe('Arena B');
    expect(lock?.mapName).toBe('Arena A');
    expect(Object.isFrozen(lock)).toBe(true);
  });

  it('can attach only a valid server-authored mode lock to a snapshot', () => {
    const initial = createArenaScheduleMessage(42_000, {}, undefined, MAPS);
    const lock = lockScheduledArena(initial, GameModeType.CORE_RUN, 42_000);
    if (!lock) throw new Error('expected a server-created lock');
    const snapshot = createArenaScheduleMessage(42_500, {}, lock, MAPS);
    expect(snapshot.lockedArena).toEqual({
      ...snapshot.schedules.find(({ mode }) => mode === GameModeType.CORE_RUN),
      lockedAt: 42_000,
    });
    expect(lockScheduledArena(snapshot, 'missing' as GameModeType, 42_000)).toBeNull();
  });
});
