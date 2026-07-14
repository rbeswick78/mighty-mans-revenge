import { GAME_MODE_ROTATION, MUTATORS, type MutatorId } from '../config/game.js';
import { GameModeType } from '../types/game.js';

const NONE: readonly MutatorId[] = Object.freeze([]);

/**
 * Shared mode-economy exclusions. Match scheduling, Gauntlet forecasts, and
 * player-authored Spar preferences all consult this one table so a client can
 * never promise a chaos rule that the authoritative mode must discard.
 */
export const MODE_MUTATOR_EXCLUSIONS = Object.freeze({
  [GameModeType.DEATHMATCH]: NONE,
  [GameModeType.KOTH]: NONE,
  [GameModeType.GUN_GAME]: Object.freeze([
    'grenades_only',
    'infinite_ammo',
    'fists_only',
    'weapon_roulette',
    'last_laugh',
    'scavenger_rush',
  ] as const),
  [GameModeType.LAST_STAND]: NONE,
  [GameModeType.KILL_CONFIRMED]: NONE,
  [GameModeType.ONE_IN_THE_CHAMBER]: Object.freeze([
    'grenades_only',
    'infinite_ammo',
    'fists_only',
    'weapon_roulette',
    'low_health',
    'vampire',
    'turbo_grenades',
    'ability_overdrive',
    'last_laugh',
    'scavenger_rush',
  ] as const),
  [GameModeType.CORE_RUN]: NONE,
  [GameModeType.BOUNTY_HUNT]: NONE,
}) satisfies Readonly<Record<GameModeType, readonly MutatorId[]>>;

export function isMutatorCompatibleWithMode(mutatorId: MutatorId, gameMode: GameModeType): boolean {
  return !(MODE_MUTATOR_EXCLUSIONS[gameMode] as readonly MutatorId[]).includes(mutatorId);
}

/** Rotation-order modes that can honestly schedule the requested mutator. */
export function compatibleGameModesForMutator(mutatorId: MutatorId): GameModeType[] {
  return GAME_MODE_ROTATION.filter((mode) => isMutatorCompatibleWithMode(mutatorId, mode));
}

/** Defensive runtime guard for untrusted wire/storage values. */
export function isMutatorId(value: unknown): value is MutatorId {
  return typeof value === 'string' && (MUTATORS.POOL as readonly string[]).includes(value);
}
