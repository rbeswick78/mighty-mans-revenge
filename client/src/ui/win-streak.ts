import type { WinStreakResult } from '@shared/types/game.js';

export type WinStreakTone = 'active' | 'new_best' | 'ended' | 'quiet';

export interface WinStreakPresentation {
  text: string;
  tone: WinStreakTone;
}

/**
 * Compact results-header story for one player's persisted win streak.
 * The caller supplies the match outcome so draws can hold rather than end it.
 */
export function winStreakPresentation(
  streak: WinStreakResult | undefined,
  outcome: 'win' | 'loss' | 'draw',
): WinStreakPresentation | null {
  if (!streak) return null;

  if (outcome === 'draw') {
    if (streak.current >= 2) {
      return { text: `${streak.current} WINS - HOLDS`, tone: 'active' };
    }
    return streak.best >= 2
      ? { text: `BEST ${streak.best}`, tone: 'quiet' }
      : { text: 'NO STREAK', tone: 'quiet' };
  }

  if (outcome === 'loss') {
    if (streak.previous >= 2) {
      return { text: `${streak.previous} WINS - ENDED`, tone: 'ended' };
    }
    return streak.best >= 2
      ? { text: `BEST ${streak.best}`, tone: 'quiet' }
      : { text: 'NO STREAK', tone: 'quiet' };
  }

  if (streak.current >= 2 && streak.best > streak.previousBest) {
    return { text: `${streak.current} WINS - NEW BEST`, tone: 'new_best' };
  }
  if (streak.current >= 2) {
    return { text: `${streak.current} WINS - BEST ${streak.best}`, tone: 'active' };
  }
  return { text: `1 WIN - BEST ${streak.best}`, tone: 'active' };
}
