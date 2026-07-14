import type { PlayerId } from '@shared/types/common.js';
import type { MatchResult } from '@shared/types/game.js';

export const SCRAP_PIT_RECORD_STORAGE_KEY = 'mmr_scrap_pit_record';

const MAX_RECORD_COUNT = 999_999_999;

export interface ScrapPitRecord {
  rounds: number;
  wins: number;
  currentStreak: number;
  bestStreak: number;
  /** Prevent a recreated Results scene from banking the same round twice. */
  lastMatchId: string | null;
}

export type ScrapPitRecordOutcome = 'win' | 'loss' | 'draw';

export interface ScrapPitRecordUpdate {
  record: ScrapPitRecord;
  outcome: ScrapPitRecordOutcome;
  previousStreak: number;
  isNewBest: boolean;
  counted: boolean;
}

export const EMPTY_SCRAP_PIT_RECORD: Readonly<ScrapPitRecord> = Object.freeze({
  rounds: 0,
  wins: 0,
  currentStreak: 0,
  bestStreak: 0,
  lastMatchId: null,
});

function safeCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.min(MAX_RECORD_COUNT, Math.max(0, Math.floor(value)));
}

function safeMatchId(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= 128 ? value : null;
}

/** Load an old or malformed local record without letting impossible totals leak into UI. */
export function normalizeScrapPitRecord(raw: string | null): ScrapPitRecord {
  if (!raw) return { ...EMPTY_SCRAP_PIT_RECORD };

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const rounds = safeCount(parsed.rounds);
    const wins = Math.min(safeCount(parsed.wins), rounds);
    const currentStreak = Math.min(safeCount(parsed.currentStreak), wins);
    const bestStreak = Math.max(currentStreak, Math.min(safeCount(parsed.bestStreak), wins));
    return {
      rounds,
      wins,
      currentStreak,
      bestStreak,
      lastMatchId: safeMatchId(parsed.lastMatchId),
    };
  } catch {
    return { ...EMPTY_SCRAP_PIT_RECORD };
  }
}

/**
 * Bank one completed Scrap Pit result. The caller supplies only an
 * authoritative MatchResult and the connected local id; this helper never
 * infers wins from client-side score presentation.
 */
export function scrapPitRecordUpdate(
  result: Pick<MatchResult, 'matchId' | 'winnerId'> | null,
  localPlayerId: PlayerId | null,
  previous: ScrapPitRecord,
): ScrapPitRecordUpdate | null {
  if (!result || !localPlayerId) return null;

  const outcome: ScrapPitRecordOutcome =
    result.winnerId === null ? 'draw' : result.winnerId === localPlayerId ? 'win' : 'loss';
  if (result.matchId === previous.lastMatchId) {
    return {
      record: { ...previous },
      outcome,
      previousStreak: previous.currentStreak,
      isNewBest: false,
      counted: false,
    };
  }

  const rounds = Math.min(MAX_RECORD_COUNT, previous.rounds + 1);
  const wins = Math.min(MAX_RECORD_COUNT, previous.wins + Number(outcome === 'win'));
  const currentStreak =
    outcome === 'win'
      ? Math.min(MAX_RECORD_COUNT, previous.currentStreak + 1)
      : outcome === 'draw'
        ? previous.currentStreak
        : 0;
  const bestStreak = Math.max(previous.bestStreak, currentStreak);

  return {
    record: {
      rounds,
      wins,
      currentStreak,
      bestStreak,
      lastMatchId: result.matchId,
    },
    outcome,
    previousStreak: previous.currentStreak,
    isNewBest: currentStreak > previous.bestStreak,
    counted: true,
  };
}

/** Compact persistent hook shown directly on the solo-route button. */
export function scrapPitButtonLabel(record: ScrapPitRecord): string {
  if (record.wins === 0) return 'SCRAP PIT\nNO WINS YET';
  return `SCRAP PIT\n${record.wins}W · BEST ${record.bestStreak}`;
}

/** One results-screen story that makes the next direct rematch meaningful. */
export function scrapPitRecordResultLabel(update: ScrapPitRecordUpdate | null): string | null {
  if (!update) return null;
  const { record } = update;
  const prefix = `PIT RECORD: ${record.wins}W / ${record.rounds}`;

  if (!update.counted) return `${prefix}  //  BEST RUN ${record.bestStreak}`;
  if (update.outcome === 'win') {
    if (record.wins === 1) return `${prefix}  //  FIRST WIN  //  RUN 1`;
    if (update.isNewBest) {
      return `${prefix}  //  ${record.currentStreak}-WIN RUN - NEW BEST`;
    }
    return `${prefix}  //  RUN ${record.currentStreak}  //  BEST ${record.bestStreak}`;
  }
  if (update.outcome === 'draw') {
    return record.currentStreak > 0
      ? `${prefix}  //  RUN ${record.currentStreak} HOLDS  //  BEST ${record.bestStreak}`
      : `${prefix}  //  DRAW  //  BEST RUN ${record.bestStreak}`;
  }
  return update.previousStreak >= 2
    ? `${prefix}  //  ${update.previousStreak}-WIN RUN ENDED  //  BEST ${record.bestStreak}`
    : `${prefix}  //  BEST RUN ${record.bestStreak}`;
}
