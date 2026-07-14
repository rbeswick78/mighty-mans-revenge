import {
  MUTATORS,
  PRACTICE_GAUNTLET,
  characterSpeedMultiplier,
  type CharacterId,
  type MutatorId,
} from '../config/game.js';
import { MovementModifiers } from './physics.js';

/**
 * Fold the active mutators (plus the local player's temporary boost timers)
 * into a single MovementModifiers. Pure and shared so the client
 * (prediction + reconciliation) and server (authority) derive identical
 * movement behavior from the same inputs.
 *
 * Composition rules when mutators stack (mid-match + final-minute):
 *   - speed multipliers MULTIPLY (super_speed 1.6 × spawn_rush 1.3),
 *   - sprint stays disabled / stamina stays frozen if ANY active mutator
 *     says so (today only super_speed does either).
 *
 * `secondWindTimer` is the per-player boost countdown from PlayerState —
 * Second Wind sets this legacy-named timer on respawn; Blood Rush sets it
 * on a qualifying kill. `spawnRushTimer` is independent so the boon works
 * without either mutator and composes with them. Passing both keeps this pure.
 */
export function mutatorsToMovementModifiers(
  active: readonly MutatorId[],
  secondWindTimer: number = 0,
  spawnRushTimer: number = 0,
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
  if (active.includes('blood_rush') && secondWindTimer > 0) {
    speedMultiplier *= MUTATORS.BLOOD_RUSH_SPEED_MULTIPLIER;
    any = true;
  }
  if (spawnRushTimer > 0) {
    speedMultiplier *= PRACTICE_GAUNTLET.BOON_SPAWN_RUSH_MULTIPLIER;
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
  spawnRushTimer: number = 0,
): MovementModifiers {
  const base = mutatorsToMovementModifiers(active, secondWindTimer, spawnRushTimer);
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
    case 'blood_rush':
      return 'BLOOD RUSH';
    case 'ability_overdrive':
      return 'ABILITY OVERDRIVE';
    case 'blackout':
      return 'BLACKOUT';
    case 'fists_only':
      return 'FISTS ONLY';
    case 'weapon_roulette':
      return 'WEAPON ROULETTE';
    case 'wasteland_warp':
      return 'WASTELAND WARP';
    case 'demolition_wave':
      return 'DEMOLITION WAVE';
    case 'last_laugh':
      return 'LAST LAUGH';
    case 'scavenger_rush':
      return 'SCAVENGER RUSH';
    case 'radiation_storm':
      return 'RADIATION STORM';
    case 'scrapstorm':
      return 'SCRAPSTORM';
  }
}

/** Compact activation-rule copy shown beneath each mutator name. */
const EVENT_START_DETAILS: Readonly<Record<MutatorId, string>> = Object.freeze({
  super_speed: '1.6X SPEED - SPRINT LOCKED',
  grenades_only: 'GRENADES REFILL EVERY 3 SEC',
  infinite_ammo: 'NO RELOADS',
  low_health: 'EVERYONE HAS 1 HP',
  big_heads: 'BIGGER TARGETS',
  vampire: 'DAMAGE HEALS THE ATTACKER',
  turbo_grenades: 'FASTER THROWS + RECHARGE',
  second_wind: 'RESPAWN WITH 3 SEC SPEED',
  blood_rush: `KILLS GRANT ${MUTATORS.BLOOD_RUSH_DURATION_SECONDS} SEC SPEED`,
  ability_overdrive: `${MUTATORS.ABILITY_OVERDRIVE_RECHARGE_MULTIPLIER}X ABILITY RECHARGE`,
  blackout: 'STAY CLOSE OR LOSE SIGHT',
  fists_only: 'GUNS OFF - THROW HANDS',
  weapon_roulette: 'LOADOUT SWAPS EVERY 10 SEC',
  wasteland_warp: 'POSITIONS SWAP EVERY 12 SEC',
  demolition_wave: 'COVER + GATES COLLAPSE',
  last_laugh: 'DEATHS DROP LIVE BOMBS',
  scavenger_rush: 'SUPPLIES ROTATE EVERY 12 SEC',
  radiation_storm: 'SAFE ZONE IS SHRINKING',
  scrapstorm: 'DODGE THE PAINTED BLASTS',
});

export function eventStartDetail(event: MutatorId): string {
  return EVENT_START_DETAILS[event];
}

/** Mutator pairs whose combined rules would be redundant or contradictory. */
export function mutatorsConflict(a: MutatorId, b: MutatorId): boolean {
  const aOwnsLoadout = a === 'grenades_only' || a === 'fists_only' || a === 'weapon_roulette';
  const bOwnsLoadout = b === 'grenades_only' || b === 'fists_only' || b === 'weapon_roulette';
  const lowHealthStormPair =
    (a === 'low_health' && b === 'radiation_storm') ||
    (a === 'radiation_storm' && b === 'low_health');
  const scrapstormPressurePair =
    (a === 'scrapstorm' && (b === 'low_health' || b === 'radiation_storm')) ||
    (b === 'scrapstorm' && (a === 'low_health' || a === 'radiation_storm'));
  const speedBoostTimerPair =
    (a === 'second_wind' && b === 'blood_rush') || (a === 'blood_rush' && b === 'second_wind');
  return (
    a !== b &&
    ((aOwnsLoadout && bOwnsLoadout) ||
      lowHealthStormPair ||
      scrapstormPressurePair ||
      speedBoostTimerPair)
  );
}
