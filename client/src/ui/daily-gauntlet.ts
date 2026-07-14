import type { MatchResult } from '@shared/types/game.js';
import { dailyChallengeKey } from '@shared/utils/practice-gauntlet.js';

export const DAILY_GAUNTLET_PROGRESS_STORAGE_KEY = 'mmr_daily_gauntlet_progress';

export interface DailyGauntletProgress {
  challengeKey: string;
  bestScore: number;
  lastClearKey: string | null;
  streak: number;
}

const EMPTY_PROGRESS: DailyGauntletProgress = {
  challengeKey: '',
  bestScore: 0,
  lastClearKey: null,
  streak: 0,
};

function safeScore(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}

function safeChallengeKey(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return dailyChallengeKey(value) === value ? value : null;
}

function isPreviousUtcDay(previous: string | null, current: string): boolean {
  if (!previous) return false;
  const previousMs = Date.parse(`${previous}T00:00:00Z`);
  const currentMs = Date.parse(`${current}T00:00:00Z`);
  return currentMs - previousMs === 86_400_000;
}

export function normalizeDailyGauntletProgress(value: string | null): DailyGauntletProgress {
  if (!value) return { ...EMPTY_PROGRESS };
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return {
      challengeKey: safeChallengeKey(parsed.challengeKey) ?? '',
      bestScore: safeScore(parsed.bestScore),
      lastClearKey: safeChallengeKey(parsed.lastClearKey),
      streak: safeScore(parsed.streak),
    };
  } catch {
    return { ...EMPTY_PROGRESS };
  }
}

export function dailyGauntletProgressForKey(
  progress: DailyGauntletProgress,
  challengeKey: string,
): DailyGauntletProgress {
  return {
    ...progress,
    challengeKey,
    bestScore: progress.challengeKey === challengeKey ? safeScore(progress.bestScore) : 0,
  };
}

export function dailyGauntletProgressUpdate(
  result: MatchResult | null,
  previous: DailyGauntletProgress,
): { progress: DailyGauntletProgress; isNewBest: boolean; isFirstClear: boolean } {
  const challengeKey = safeChallengeKey(result?.gauntlet?.challengeKey);
  if (!challengeKey) {
    return { progress: { ...previous }, isNewBest: false, isFirstClear: false };
  }

  const current = dailyGauntletProgressForKey(previous, challengeKey);
  const cleared = result?.gauntlet?.outcome === 'cleared';
  const score = safeScore(result?.gauntlet?.runScore);
  const isNewBest = cleared && score > current.bestScore;
  const isFirstClear = cleared && previous.lastClearKey !== challengeKey;
  const streak = isFirstClear
    ? isPreviousUtcDay(previous.lastClearKey, challengeKey)
      ? Math.max(1, safeScore(previous.streak) + 1)
      : 1
    : safeScore(previous.streak);

  return {
    progress: {
      challengeKey,
      bestScore: isNewBest ? score : current.bestScore,
      lastClearKey: isFirstClear ? challengeKey : previous.lastClearKey,
      streak,
    },
    isNewBest,
    isFirstClear,
  };
}

export function dailyGauntletProgressLabel(
  progress: DailyGauntletProgress,
  isNewBest = false,
): string {
  const best = progress.bestScore > 0 ? progress.bestScore.toLocaleString('en-US') : 'NONE';
  return `${isNewBest ? 'NEW DAILY BEST' : 'DAILY BEST'}: ${best}  //  STREAK: ${progress.streak}`;
}
