import { COMBAT_CALLOUTS } from '@shared/config/game.js';
import { Wasteland } from '@shared/config/palette.js';
import type { PlayerId } from '@shared/types/common.js';
import type { KillFeedEntry } from '@shared/types/game.js';

export interface CombatCallout {
  headline: string;
  detail: string;
  tint: number;
}

/** Celebratory local-killer copy derived entirely from authoritative context. */
export function combatCalloutFor(
  entry: KillFeedEntry,
  localPlayerId: PlayerId,
): CombatCallout | null {
  if (entry.killerId !== localPlayerId || entry.killerId === entry.victimId) {
    return null;
  }

  const victimStreak = entry.victimStreakEnded ?? 0;
  if (victimStreak >= COMBAT_CALLOUTS.SHUTDOWN_MIN_VICTIM_STREAK) {
    return {
      headline: 'SHUTDOWN!',
      detail: `ENDED A ${victimStreak} KILL STREAK`,
      tint: Wasteland.HIT_FLASH,
    };
  }

  if (entry.isRevenge) {
    return {
      headline: 'PAYBACK!',
      detail: 'SCORE SETTLED',
      tint: Wasteland.HEALTH_WARNING,
    };
  }

  const killerStreak = entry.killerStreak ?? 0;
  if (killerStreak >= COMBAT_CALLOUTS.UNSTOPPABLE_START) {
    return {
      headline: 'UNSTOPPABLE!',
      detail: `${killerStreak} KILL STREAK`,
      tint: Wasteland.TEXT_RELOAD_WARNING,
    };
  }
  if (killerStreak >= COMBAT_CALLOUTS.RAMPAGE_START) {
    return {
      headline: 'RAMPAGE!',
      detail: `${killerStreak} KILL STREAK`,
      tint: Wasteland.TEXT_RELOAD_WARNING,
    };
  }
  if (killerStreak >= COMBAT_CALLOUTS.STREAK_START) {
    return {
      headline: 'ON A ROLL!',
      detail: `${killerStreak} KILL STREAK`,
      tint: Wasteland.TEXT_RELOAD_WARNING,
    };
  }
  return null;
}
