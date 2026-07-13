import {
  MUTATORS,
  characterSpeedMultiplier,
  type CharacterId,
  type MutatorId,
} from '../config/game.js';
import { MovementModifiers } from './physics.js';

/**
 * Fold the active mutators (plus the local player's second_wind boost
 * timer) into a single MovementModifiers. Pure and shared so the client
 * (prediction + reconciliation) and server (authority) derive identical
 * movement behavior from the same inputs.
 *
 * Composition rules when mutators stack (mid-match + final-minute):
 *   - speed multipliers MULTIPLY (super_speed 1.6 × second_wind 1.3),
 *   - sprint stays disabled / stamina stays frozen if ANY active mutator
 *     says so (today only super_speed does either).
 *
 * `secondWindTimer` is the per-player boost countdown from PlayerState —
 * passed in rather than read from a player object so this stays a pure
 * function of primitives.
 */
export function mutatorsToMovementModifiers(
  active: readonly MutatorId[],
  secondWindTimer: number = 0,
): MovementModifiers {
  let speedMultiplier = 1;
  let sprintEnabled = true;
  let staminaFrozen = false;
  let any = false;

  if (active.includes('super_speed')) {
    speedMultiplier *= MUTATORS.SUPER_SPEED_MULTIPLIER;
    sprintEnabled = false;
    staminaFrozen = true;
    any = true;
  }
  if (active.includes('second_wind') && secondWindTimer > 0) {
    speedMultiplier *= MUTATORS.SECOND_WIND_SPEED_MULTIPLIER;
    any = true;
  }

  if (!any) return {};
  return { speedMultiplier, sprintEnabled, staminaFrozen };
}

/**
 * The full per-player movement modifier set: the character's stat-identity
 * speed multiplier folded into whatever the active mutators say. This is
 * THE function both sides must call for movement — server authority
 * (match.ts input loop) and client prediction + reconciliation
 * (network-manager.ts) — so per-character speed can never drift between
 * them. Character speed composes multiplicatively with mutator speed
 * (a super_speed Bubba runs 0.85 × 1.6).
 *
 * `characterId` is nullable because PlayerState.characterId is null until
 * select locks; movement can't happen before COUNTDOWN, so the neutral
 * fallback is never observable in play.
 */
export function playerMovementModifiers(
  characterId: CharacterId | null,
  active: readonly MutatorId[],
  secondWindTimer: number = 0,
): MovementModifiers {
  const base = mutatorsToMovementModifiers(active, secondWindTimer);
  const charSpeed = characterSpeedMultiplier(characterId);
  if (charSpeed === 1) return base;
  return {
    ...base,
    speedMultiplier: (base.speedMultiplier ?? 1) * charSpeed,
  };
}

/** Display name for HUD banners and the active-mutator label. */
export function eventDisplayName(event: MutatorId): string {
  switch (event) {
    case 'super_speed':
      return 'SUPER SPEED';
    case 'grenades_only':
      return 'GRENADES ONLY';
    case 'infinite_ammo':
      return 'INFINITE AMMO';
    case 'low_health':
      return 'ONE-SHOT KILLS';
    case 'big_heads':
      return 'BIG HEADS';
    case 'vampire':
      return 'VAMPIRE';
    case 'turbo_grenades':
      return 'TURBO GRENADES';
    case 'second_wind':
      return 'SECOND WIND';
    case 'blackout':
      return 'BLACKOUT';
    case 'fists_only':
      return 'FISTS ONLY';
    case 'weapon_roulette':
      return 'WEAPON ROULETTE';
  }
}

/** Mutator pairs that compete for ownership of the shared core loadout. */
export function mutatorsConflict(a: MutatorId, b: MutatorId): boolean {
  const aOwnsLoadout =
    a === 'grenades_only' || a === 'fists_only' || a === 'weapon_roulette';
  const bOwnsLoadout =
    b === 'grenades_only' || b === 'fists_only' || b === 'weapon_roulette';
  return (
    a !== b &&
    aOwnsLoadout &&
    bOwnsLoadout
  );
}
