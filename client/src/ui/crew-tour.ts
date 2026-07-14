import { CREW_BATTLE_MODES, isCrewBattleMode } from '@shared/config/game.js';
import type { PlayerId } from '@shared/types/common.js';
import { GameModeType, type MatchResult } from '@shared/types/game.js';

export const CREW_TOUR_STORAGE_KEY = 'mmr_crew_tour';

const MAX_RECORD_COUNT = 999_999_999;

export interface CrewTourRecord {
  /** Completed four-patch sets. */
  toursCompleted: number;
  /** Unique objective wins held toward the next tour, in canonical order. */
  securedModes: readonly GameModeType[];
  /** All Crew victories, including duplicate objective wins. */
  wins: number;
  currentWinStreak: number;
  bestWinStreak: number;
  /** Prevent a recreated Results scene from banking the same fight twice. */
  lastMatchId: string | null;
}

export type CrewTourOutcome = 'win' | 'loss' | 'draw';

export interface CrewTourUpdate {
  record: CrewTourRecord;
  outcome: CrewTourOutcome;
  mode: GameModeType;
  previousWinStreak: number;
  earnedPatch: boolean;
  completedTour: boolean;
  isNewBest: boolean;
  counted: boolean;
}

export const EMPTY_CREW_TOUR_RECORD: Readonly<CrewTourRecord> = Object.freeze({
  toursCompleted: 0,
  securedModes: Object.freeze([]),
  wins: 0,
  currentWinStreak: 0,
  bestWinStreak: 0,
  lastMatchId: null,
});

function safeCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.min(MAX_RECORD_COUNT, Math.max(0, Math.floor(value)));
}

function safeMatchId(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= 128 ? value : null;
}

function patchName(mode: GameModeType): string {
  switch (mode) {
    case GameModeType.DEATHMATCH:
      return 'KOs';
    case GameModeType.KOTH:
      return 'HILL';
    case GameModeType.KILL_CONFIRMED:
      return 'TAGS';
    case GameModeType.CORE_RUN:
      return 'CORE';
    default:
      return 'CREW';
  }
}

/** Normalize bounded device-local progress before any scene renders it. */
export function normalizeCrewTourRecord(raw: string | null): CrewTourRecord {
  if (!raw) return { ...EMPTY_CREW_TOUR_RECORD, securedModes: [] };

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const wins = safeCount(parsed.wins);
    const toursCompleted = Math.min(
      safeCount(parsed.toursCompleted),
      Math.floor(wins / CREW_BATTLE_MODES.length),
    );
    const possiblePatches = Math.min(
      CREW_BATTLE_MODES.length,
      wins - toursCompleted * CREW_BATTLE_MODES.length,
    );
    const rawModes = Array.isArray(parsed.securedModes) ? parsed.securedModes : [];
    const securedModes = CREW_BATTLE_MODES.filter((mode) => rawModes.includes(mode)).slice(
      0,
      possiblePatches,
    );
    const currentWinStreak = Math.min(safeCount(parsed.currentWinStreak), wins);
    const bestWinStreak = Math.max(
      currentWinStreak,
      Math.min(safeCount(parsed.bestWinStreak), wins),
    );

    return {
      toursCompleted,
      securedModes,
      wins,
      currentWinStreak,
      bestWinStreak,
      lastMatchId: safeMatchId(parsed.lastMatchId),
    };
  } catch {
    return { ...EMPTY_CREW_TOUR_RECORD, securedModes: [] };
  }
}

/**
 * Bank one completed Crew result from the authoritative winning side. Mode
 * score presentation is deliberately irrelevant to this progression.
 */
export function crewTourUpdate(
  result: Pick<
    MatchResult,
    'matchId' | 'matchKind' | 'gameMode' | 'winnerTeamId' | 'playerTeams'
  > | null,
  localPlayerId: PlayerId | null,
  previous: CrewTourRecord,
): CrewTourUpdate | null {
  if (
    !result ||
    !localPlayerId ||
    result.matchKind !== 'duos' ||
    result.winnerTeamId === undefined ||
    !result.playerTeams ||
    !isCrewBattleMode(result.gameMode)
  ) {
    return null;
  }

  const localTeam = result.playerTeams[localPlayerId];
  if (!localTeam) return null;
  const outcome: CrewTourOutcome =
    result.winnerTeamId === null ? 'draw' : result.winnerTeamId === localTeam ? 'win' : 'loss';

  if (result.matchId === previous.lastMatchId) {
    return {
      record: { ...previous, securedModes: [...previous.securedModes] },
      outcome,
      mode: result.gameMode,
      previousWinStreak: previous.currentWinStreak,
      earnedPatch: false,
      completedTour: false,
      isNewBest: false,
      counted: false,
    };
  }

  const wins = Math.min(MAX_RECORD_COUNT, previous.wins + Number(outcome === 'win'));
  const currentWinStreak =
    outcome === 'win'
      ? Math.min(MAX_RECORD_COUNT, previous.currentWinStreak + 1)
      : outcome === 'draw'
        ? previous.currentWinStreak
        : 0;
  const bestWinStreak = Math.max(previous.bestWinStreak, currentWinStreak);
  let toursCompleted = previous.toursCompleted;
  let securedModes = [...previous.securedModes];
  const earnedPatch = outcome === 'win' && !securedModes.includes(result.gameMode);
  if (earnedPatch) securedModes.push(result.gameMode);
  securedModes = CREW_BATTLE_MODES.filter((mode) => securedModes.includes(mode));
  const completedTour = earnedPatch && securedModes.length === CREW_BATTLE_MODES.length;
  if (completedTour) {
    toursCompleted = Math.min(MAX_RECORD_COUNT, toursCompleted + 1);
    securedModes = [];
  }

  return {
    record: {
      toursCompleted,
      securedModes,
      wins,
      currentWinStreak,
      bestWinStreak,
      lastMatchId: result.matchId,
    },
    outcome,
    mode: result.gameMode,
    previousWinStreak: previous.currentWinStreak,
    earnedPatch,
    completedTour,
    isNewBest: currentWinStreak > previous.bestWinStreak,
    counted: true,
  };
}

/** Persistent hook on the route button, compact enough for its narrow column. */
export function crewTourButtonLabel(record: CrewTourRecord): string {
  const progress = record.securedModes.length;
  if (record.toursCompleted === 0) return `CREW 2V2\nTOUR ${progress}/4`;
  return `CREW 2V2\n${record.toursCompleted} TOUR${record.toursCompleted === 1 ? '' : 'S'} - ${progress}/4`;
}

/** Pre-fight motivation for the objective selected by matchmaking. */
export function crewTourBriefingLabel(record: CrewTourRecord, mode: GameModeType): string {
  const name = patchName(mode);
  const held = record.securedModes.includes(mode);
  if (!held && record.securedModes.length === CREW_BATTLE_MODES.length - 1) {
    return `FINAL PATCH: ${name} // WIN TO COMPLETE TOUR`;
  }
  return `CREW TOUR ${record.securedModes.length}/4 // ${name} PATCH ${held ? 'HELD' : 'OPEN'}`;
}

/** Results story: patch progress first, then the secondary consecutive-win chase. */
export function crewTourResultLabel(update: CrewTourUpdate | null): string | null {
  if (!update) return null;
  const { record } = update;
  const prefix = `CREW TOUR ${record.securedModes.length}/4`;
  if (!update.counted) return `${prefix} // BEST WIN RUN ${record.bestWinStreak}`;
  if (update.completedTour) {
    const run = record.currentWinStreak;
    return `CREW TOUR #${record.toursCompleted} COMPLETE // 4 PATCHES // RUN ${run}${update.isNewBest ? ' - NEW BEST' : ''}`;
  }
  if (update.outcome === 'win') {
    const patch = `${patchName(update.mode)} ${update.earnedPatch ? 'PATCH SECURED' : 'PATCH HELD'}`;
    return `${prefix} // ${patch} // RUN ${record.currentWinStreak}${update.isNewBest ? ' - NEW BEST' : ''}`;
  }
  if (update.outcome === 'draw') {
    return record.currentWinStreak > 0
      ? `${prefix} // RUN ${record.currentWinStreak} HOLDS // BEST ${record.bestWinStreak}`
      : `${prefix} // DRAW // BEST WIN RUN ${record.bestWinStreak}`;
  }
  return update.previousWinStreak >= 2
    ? `${prefix} // ${update.previousWinStreak}-WIN RUN ENDED // BEST ${record.bestWinStreak}`
    : `${prefix} // BEST WIN RUN ${record.bestWinStreak}`;
}
