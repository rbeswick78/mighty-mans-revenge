import { GAME_MODE_ROTATION } from '@shared/config/game.js';
import type { GameModeType } from '@shared/types/game.js';
import type { ServerCapabilities } from '@shared/types/network.js';
import type { NormalizedArenaSchedule } from '../../network/arena-schedule.js';
import {
  normalizePlayRosterAvailability,
  type PlayRosterAvailability,
} from './play-roster-builder.js';

export interface PlaySchedulePresentation {
  readonly availability: PlayRosterAvailability;
  readonly arenaStatusByMode: Readonly<Partial<Record<GameModeType, string>>>;
}

function establishedAvailability(arenaNames: readonly string[]): PlayRosterAvailability {
  const preview = GAME_MODE_ROTATION.map((mode, index) => ({
    mode,
    arenaName: arenaNames[index % arenaNames.length],
  }));
  return normalizePlayRosterAvailability(preview, arenaNames);
}

function formatServerRemaining(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

/**
 * Project normalized server truth into the pure Batch 5 Play boundary. This
 * formats only the server-supplied clock delta; it never selects an arena,
 * advances a schedule, or invents a queue lock.
 */
export function playSchedulePresentation(
  capabilities: Readonly<ServerCapabilities>,
  schedule: NormalizedArenaSchedule | null,
  arenaNames: readonly string[],
): PlaySchedulePresentation {
  if (!capabilities.schedules || schedule === null) {
    return Object.freeze({
      availability: establishedAvailability(arenaNames),
      arenaStatusByMode: Object.freeze({}),
    });
  }

  const entries = schedule.schedules
    .filter(({ mode }) => schedule.forcedMode === null || mode === schedule.forcedMode)
    .map((entry) =>
      schedule.lockedArena?.mode === entry.mode
        ? { mode: entry.mode, arenaName: schedule.lockedArena.mapName }
        : { mode: entry.mode, arenaName: entry.mapName },
    );
  const arenaStatusByMode: Partial<Record<GameModeType, string>> = {};
  for (const entry of schedule.schedules) {
    if (schedule.forcedMode !== null && entry.mode !== schedule.forcedMode) continue;
    arenaStatusByMode[entry.mode] =
      schedule.lockedArena?.mode === entry.mode
        ? 'LOCKED AT QUEUE ENTRY  /  SERVER AUTHORITY'
        : `ROTATES IN ${formatServerRemaining(entry.rotationEndsAt - schedule.serverTime)}  /  SERVER CLOCK`;
  }
  return Object.freeze({
    availability: normalizePlayRosterAvailability(entries, arenaNames),
    arenaStatusByMode: Object.freeze(arenaStatusByMode),
  });
}
