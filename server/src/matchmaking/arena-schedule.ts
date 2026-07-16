import {
  ARENA_SCHEDULE,
  GAME_MODE_ROTATION,
  listMapNames,
  type GameModeType,
  type ScheduledArena,
  type ScheduledArenaLock,
  type ServerLobbyConfigMessage,
} from '@shared/game';
type ScheduleEnv = Readonly<Record<string, string | undefined>>;

function validForcedMode(value: string | undefined): GameModeType | undefined {
  return GAME_MODE_ROTATION.find((mode) => mode === value);
}

/**
 * Build the complete server-owned standard-mode schedule for an epoch sample.
 * Each mode advances through registry order from a deterministic mode offset;
 * clients receive only the resulting map names and never run this algorithm.
 */
export function createArenaScheduleMessage(
  serverTime: number,
  env: ScheduleEnv = process.env,
  lockedArena?: Readonly<ScheduledArenaLock>,
  mapNames: readonly string[] = listMapNames(),
): ServerLobbyConfigMessage {
  if (!Number.isFinite(serverTime) || serverTime < 0 || mapNames.length === 0) {
    throw new Error('Arena schedules require a finite server time and at least one map');
  }

  const normalizedTime = Math.floor(serverTime);
  const slot = Math.floor(normalizedTime / ARENA_SCHEDULE.ROTATION_MS);
  const rotationEndsAt = (slot + 1) * ARENA_SCHEDULE.ROTATION_MS;
  const forcedMap = mapNames.find((mapName) => mapName === env['FORCE_MAP']);
  const schedules: ScheduledArena[] = GAME_MODE_ROTATION.map((mode, modeOffset) =>
    Object.freeze({
      mode,
      mapName: forcedMap ?? mapNames[(slot + modeOffset) % mapNames.length]!,
      rotationEndsAt,
    }),
  );
  const forcedMode = validForcedMode(env['FORCE_MODE']);
  const message: ServerLobbyConfigMessage = {
    type: 'server:lobbyConfig',
    serverTime: normalizedTime,
    schedules,
    ...(forcedMode === undefined ? {} : { forcedMode }),
  };
  return Object.freeze({
    ...message,
    schedules: Object.freeze(schedules),
    ...(lockedArena === undefined ? {} : { lockedArena: Object.freeze({ ...lockedArena }) }),
  });
}

/**
 * Capture one immutable server-authored outcome at queue entry. The lock is
 * intentionally independent of later schedule snapshots. The generalized
 * intent queue consumes this boundary without deriving schedules itself.
 */
export function lockScheduledArena(
  snapshot: Pick<ServerLobbyConfigMessage, 'schedules'>,
  mode: GameModeType,
  lockedAt: number,
): ScheduledArenaLock | null {
  const scheduled = snapshot.schedules.find((entry) => entry.mode === mode);
  if (!scheduled || !Number.isFinite(lockedAt) || lockedAt < 0) return null;
  return Object.freeze({
    ...scheduled,
    lockedAt: Math.floor(lockedAt),
  });
}
