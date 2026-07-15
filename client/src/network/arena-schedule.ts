import { ARENA_SCHEDULE, GAME_MODE_ROTATION } from '@shared/config/game.js';
import type { GameModeType } from '@shared/types/game.js';
import type { ScheduledArena, ScheduledArenaLock } from '@shared/types/network.js';

export interface NormalizedArenaSchedule {
  readonly serverTime: number;
  readonly schedules: readonly Readonly<ScheduledArena>[];
  readonly forcedMode: GameModeType | null;
  readonly lockedArena: Readonly<ScheduledArenaLock> | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function gameMode(value: unknown): GameModeType | null {
  return typeof value === 'string'
    ? (GAME_MODE_ROTATION.find((candidate) => candidate === value) ?? null)
    : null;
}

function finiteEpoch(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : null;
}

function normalizeEntry(
  value: unknown,
  serverTime: number,
  allowedArenas: ReadonlySet<string>,
): Readonly<ScheduledArena> | null {
  if (!isRecord(value)) return null;
  const mode = gameMode(value['mode']);
  const mapName = value['mapName'];
  const rotationEndsAt = finiteEpoch(value['rotationEndsAt']);
  if (
    mode === null ||
    typeof mapName !== 'string' ||
    !allowedArenas.has(mapName) ||
    rotationEndsAt === null ||
    rotationEndsAt <= serverTime ||
    rotationEndsAt - serverTime > ARENA_SCHEDULE.ROTATION_MS
  ) {
    return null;
  }
  return Object.freeze({ mode, mapName, rotationEndsAt });
}

function normalizeLock(
  value: unknown,
  serverTime: number,
  allowedArenas: ReadonlySet<string>,
): Readonly<ScheduledArenaLock> | null {
  if (!isRecord(value)) return null;
  const mode = gameMode(value['mode']);
  const mapName = value['mapName'];
  const rotationEndsAt = finiteEpoch(value['rotationEndsAt']);
  const lockedAt = finiteEpoch(value['lockedAt']);
  if (
    mode === null ||
    typeof mapName !== 'string' ||
    !allowedArenas.has(mapName) ||
    rotationEndsAt === null ||
    lockedAt === null ||
    lockedAt > serverTime ||
    rotationEndsAt <= lockedAt ||
    rotationEndsAt - lockedAt > ARENA_SCHEDULE.ROTATION_MS
  ) {
    return null;
  }
  return Object.freeze({ mode, mapName, rotationEndsAt, lockedAt });
}

/**
 * Normalize the untrusted additive wire snapshot without deriving an arena,
 * wall clock, or queue lock. Any incomplete/malformed complete snapshot fails
 * closed to null so callers can retain the established Batch 5 behavior.
 */
export function normalizeArenaSchedule(
  value: unknown,
  allowedArenaNames: readonly string[],
): NormalizedArenaSchedule | null {
  if (!isRecord(value) || value['type'] !== 'server:lobbyConfig') return null;
  const serverTime = finiteEpoch(value['serverTime']);
  if (serverTime === null || !Array.isArray(value['schedules'])) return null;

  const allowedArenas = new Set(allowedArenaNames);
  const schedules = value['schedules'].map((entry) =>
    normalizeEntry(entry, serverTime, allowedArenas),
  );
  if (schedules.some((entry) => entry === null)) return null;
  const complete = schedules as Readonly<ScheduledArena>[];
  const modes = complete.map(({ mode }) => mode);
  const rotationDeadlines = new Set(complete.map(({ rotationEndsAt }) => rotationEndsAt));
  if (
    complete.length !== GAME_MODE_ROTATION.length ||
    new Set(modes).size !== GAME_MODE_ROTATION.length ||
    GAME_MODE_ROTATION.some((mode) => !modes.includes(mode)) ||
    rotationDeadlines.size !== 1
  ) {
    return null;
  }

  const rawForcedMode = value['forcedMode'];
  const forcedMode = rawForcedMode === undefined ? null : gameMode(rawForcedMode);
  if (rawForcedMode !== undefined && forcedMode === null) return null;

  const rawLock = value['lockedArena'];
  const lockedArena =
    rawLock === undefined ? null : normalizeLock(rawLock, serverTime, allowedArenas);
  if (
    (rawLock !== undefined && lockedArena === null) ||
    (forcedMode !== null && lockedArena !== null && lockedArena.mode !== forcedMode)
  ) {
    return null;
  }

  return Object.freeze({
    serverTime,
    schedules: Object.freeze(complete),
    forcedMode,
    lockedArena,
  });
}
