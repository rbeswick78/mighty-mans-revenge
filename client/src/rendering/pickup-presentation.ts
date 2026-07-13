import { MUTATORS, PICKUP } from '@shared/config/game.js';
import type { PickupState } from '@shared/types/pickup.js';

export interface PickupPresentation {
  scale: number;
  tint: number | null;
  alpha: number;
}

/** Pure, snapshot-driven urgency treatment for short-lived dynamic pickups. */
export function pickupPresentation(
  state: PickupState,
  nowMs: number,
): PickupPresentation {
  if (state.isDroppedWeapon) {
    const remainingFraction = remainingLifetimeFraction(
      state.expiresInSeconds,
      PICKUP.DROPPED_WEAPON_LIFETIME_SECONDS,
    );
    const urgency = 1 - remainingFraction;
    return {
      scale: 1 + Math.sin(nowMs * (0.01 + urgency * 0.018)) * 0.1,
      tint: 0xffd166,
      alpha: 0.78 + urgency * 0.22,
    };
  }

  if (state.isScavengerRushDrop) {
    const remainingFraction = remainingLifetimeFraction(
      state.expiresInSeconds,
      MUTATORS.SCAVENGER_RUSH_DROP_LIFETIME_SECONDS,
    );
    const urgency = 1 - remainingFraction;
    return {
      scale: 1.06 + Math.sin(nowMs * (0.008 + urgency * 0.022)) * 0.14,
      tint: 0x5ce1e6,
      alpha: 0.82 + urgency * 0.18,
    };
  }

  return { scale: 1, tint: null, alpha: 1 };
}

function remainingLifetimeFraction(
  remainingSeconds: number | undefined,
  totalSeconds: number,
): number {
  return Math.min(1, Math.max(0, remainingSeconds ?? 0) / totalSeconds);
}
