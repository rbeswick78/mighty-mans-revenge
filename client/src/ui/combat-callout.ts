import { COMBAT_CALLOUTS, COMBAT_MEDALS } from '@shared/config/game.js';
import { Wasteland } from '@shared/config/palette.js';
import type { PlayerId } from '@shared/types/common.js';
import type { KillFeedEntry } from '@shared/types/game.js';

export interface CombatCallout {
  headline: string;
  detail: string;
  tint: number;
  /** Optional emphasis for earned medals; ordinary streak copy stays neutral. */
  killSfx?: { rate: number; detune: number };
  pulse?: boolean;
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

  if (entry.isPosthumous) {
    return {
      headline: 'FROM THE GRAVE!',
      detail: "DEATH COULDN'T STOP YOU",
      tint: Wasteland.EXPLOSION_FLASH,
      killSfx: { rate: 0.78, detune: -500 },
      pulse: true,
    };
  }

  const rapidKills = entry.rapidKillCount ?? 0;
  if (rapidKills >= COMBAT_MEDALS.MAYHEM_COUNT) {
    return {
      headline: 'MAYHEM!',
      detail: `${rapidKills} RAPID KILLS`,
      tint: Wasteland.EXPLOSION_PARTICLE_A,
      killSfx: { rate: 1.3, detune: 500 },
      pulse: true,
    };
  }
  if (rapidKills >= COMBAT_MEDALS.TRIPLE_KILL_COUNT) {
    return {
      headline: 'TRIPLE KILL!',
      detail: 'THREE DOWN FAST',
      tint: Wasteland.EXPLOSION_FLASH,
      killSfx: { rate: 1.18, detune: 300 },
      pulse: true,
    };
  }
  if (rapidKills >= COMBAT_MEDALS.DOUBLE_KILL_COUNT) {
    return {
      headline: 'DOUBLE KILL!',
      detail: 'TWO DOWN FAST',
      tint: Wasteland.EXPLOSION_FLASH,
      killSfx: { rate: 1.08, detune: 150 },
      pulse: true,
    };
  }

  if (entry.isFirstBlood) {
    return {
      headline: 'FIRST BLOOD!',
      detail: 'OPENING STATEMENT',
      tint: Wasteland.HEALTH_DANGER,
      killSfx: { rate: 0.9, detune: -100 },
      pulse: true,
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
