import { EVENT } from '../config/game.js';
import { FinalMinuteEvent } from '../types/network.js';
import { MovementModifiers } from './physics.js';

/**
 * Map a final-minute event to the movement modifier it implies. Pure and
 * shared so the client (prediction + reconciliation) and server (authority)
 * derive identical movement behavior from the same active event.
 */
export function eventToMovementModifiers(
  event: FinalMinuteEvent | null,
): MovementModifiers {
  if (event === 'super_speed') {
    return {
      speedMultiplier: EVENT.SUPER_SPEED_MULTIPLIER,
      sprintEnabled: false,
      staminaFrozen: true,
    };
  }
  return {};
}

/** Display name for HUD banners. */
export function eventDisplayName(event: FinalMinuteEvent): string {
  switch (event) {
    case 'super_speed':
      return 'SUPER SPEED';
    case 'grenades_only':
      return 'GRENADES ONLY';
    case 'infinite_ammo':
      return 'INFINITE AMMO';
    case 'low_health':
      return 'ONE-SHOT KILLS';
  }
}
