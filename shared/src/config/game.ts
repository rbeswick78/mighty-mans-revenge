import type { CharacterDef } from '../types/character.js';
import type { KillWeapon } from '../types/game.js';
import type { WeaponDef } from '../types/weapon.js';
import { GameModeType } from '../types/game.js';

export const PLAYER = Object.freeze({
  BASE_SPEED: 200,
  SPRINT_SPEED: 320,
  SPRINT_DURATION: 3,
  SPRINT_RECHARGE_RATE: 1,
  MAX_HEALTH: 100,
  HITBOX_WIDTH: 24,
  HITBOX_HEIGHT: 24,
});

/**
 * Weapon roster. The rifle is the always-carried default (the pre-weapon-
 * system "GUN"); everything else is a map-spawned special weapon that
 * occupies the single pickup slot until its ammo runs out.
 */
export const WEAPONS = Object.freeze({
  rifle: Object.freeze({
    id: 'rifle',
    displayName: 'Rifle',
    damageMin: 8,
    damageMax: 25,
    falloffRangeMin: 64,
    falloffRangeMax: 400,
    /** Number of rounds in a single burst fired on left-click release. */
    burstSize: 3,
    /** Seconds between each round in a burst. */
    burstInterval: 0.15,
    magazineSize: 30,
    reloadTime: 2.0,
    pelletCount: 1,
    spreadAngle: 0,
    fireCooldown: 0,
    /** The rifle is never a map pickup. */
    pickupAmmo: 0,
  }),
  shotgun: Object.freeze({
    id: 'shotgun',
    displayName: 'Shotgun',
    /** Per-pellet damage — brutal close, useless far. */
    damageMin: 3,
    damageMax: 8,
    falloffRangeMin: 32,
    falloffRangeMax: 180,
    /** Single shot per trigger pull; pump racking gates the fire rate. */
    burstSize: 1,
    burstInterval: 0,
    magazineSize: 2,
    reloadTime: 1.5,
    pelletCount: 6,
    /** Full fan width ≈ 20°. */
    spreadAngle: 0.35,
    /** Pump-racking delay between shots. */
    fireCooldown: 0.6,
    /** Picked up with 8 shells total (2 in the mag + 6 reserve). */
    pickupAmmo: 8,
  }),
}) satisfies Readonly<Record<string, WeaponDef>>;

export type WeaponId = keyof typeof WEAPONS;
export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];

/**
 * Runtime list of every kill-attribution source, for keying per-weapon
 * kill counters. Must stay in sync with the KillWeapon union in
 * shared/src/types/game.ts (the `satisfies` clause catches typos but not
 * omissions — extend both when adding a weapon).
 */
export const KILL_WEAPONS = Object.freeze([
  'gun',
  'grenade',
  'fire',
  'shotgun',
] as const) satisfies readonly KillWeapon[];

/** Fresh all-zero per-weapon kill record (PlayerStats.killsByWeapon). */
export function createEmptyKillsByWeapon(): Record<KillWeapon, number> {
  const record = {} as Record<KillWeapon, number>;
  for (const weapon of KILL_WEAPONS) {
    record[weapon] = 0;
  }
  return record;
}

export const GRENADE = Object.freeze({
  DAMAGE: 100,
  BLAST_RADIUS: 96,
  /**
   * Damage at the edge of the blast radius, as a fraction of full DAMAGE.
   * Linear falloff between 1.0 at the center and this value at the edge;
   * anything outside the blast radius takes 0 damage.
   */
  MIN_DAMAGE_FACTOR: 0.5,
  /**
   * Fallback fuse — grenades wait for a manual right-click detonation,
   * but auto-explode after this many seconds if the player forgets or dies.
   */
  SAFETY_FUSE: 5.0,
  THROW_SPEED: 300,
  /** Grenades a player spawns with and the cap on grenade pickups. */
  STARTING_COUNT: 3,
  MAX_COUNT: 3,
  /** Grenades granted per pickup. */
  PICKUP_AMOUNT: 1,
});

export const TRAJECTORY = Object.freeze({
  /** How far ahead (seconds) the grenade aim preview simulates. */
  PREVIEW_SECONDS: 1.5,
  /** Sub-step used when simulating the preview path. */
  PREVIEW_STEP_DT: 1 / 60,
});

export const PICKUP = Object.freeze({
  GUN_AMMO_AMOUNT: 15,
  /** Respawn time for ammo/grenade top-off pickups. */
  RESPAWN_TIME: 15,
  /** HP restored by a bandage, capped at the player's max health. */
  BANDAGE_HEAL: 30,
  BANDAGE_RESPAWN_TIME: 20,
  /**
   * Respawn cycle for special-weapon pickups (shotgun). Weapon pickups
   * also start the match on this timer rather than pre-placed, so every
   * drop — including the first — gets the same pre-announcement.
   */
  WEAPON_RESPAWN_TIME: 30,
  /** Seconds before a weapon pickup lands that the warning banner fires. */
  WEAPON_ANNOUNCE_LEAD: 5,
});

export const RESPAWN = Object.freeze({
  DELAY: 3,
  INVULNERABILITY_DURATION: 2,
});

export const MATCH = Object.freeze({
  KILL_TARGET: 10,
  /**
   * Match length in seconds. Tuned to the gameplay music track
   * (game-play.mp3, ~173.5s) so the track plays through once and
   * ends at the same moment the timer hits 0:00 — no loop, no trailing
   * silence. If the music asset changes length, change this too.
   */
  TIME_LIMIT: 173,
  COUNTDOWN_DURATION: 3,
  /**
   * Max seconds players have on the character-select screen before any
   * unlocked player is auto-locked onto their current hover and the
   * countdown begins.
   */
  CHARACTER_SELECT_TIMEOUT_SEC: 30,
});

/**
 * Game mode metadata + rotation. Rotation order doubles as the cycle fresh
 * matches walk through (mirrors the map registry's rotation contract):
 * fresh matches advance a global cursor, rematches play the mode AFTER the
 * one just played (pinned at match end so the results-screen promise can't
 * lie). Display names are HUD/lobby/results copy.
 */
export const GAME_MODES = Object.freeze({
  [GameModeType.DEATHMATCH]: Object.freeze({ displayName: 'DEATHMATCH' }),
  [GameModeType.KOTH]: Object.freeze({ displayName: 'KING OF THE HILL' }),
}) satisfies Readonly<Record<GameModeType, { displayName: string }>>;

/** Rotation cycle for fresh matches and rematch succession. */
export const GAME_MODE_ROTATION: readonly GameModeType[] = Object.freeze([
  GameModeType.DEATHMATCH,
  GameModeType.KOTH,
]);

/**
 * The mode that follows `current` in rotation order, wrapping at the end.
 * Unknown values restart the cycle at the first mode rather than throwing —
 * rotation should never kill a match (same contract as getNextMapName).
 */
export function getNextGameMode(current: GameModeType): GameModeType {
  const idx = GAME_MODE_ROTATION.indexOf(current);
  return GAME_MODE_ROTATION[(idx + 1) % GAME_MODE_ROTATION.length];
}

/** HUD/lobby/results display name for a mode. */
export function gameModeDisplayName(mode: GameModeType): string {
  return GAME_MODES[mode]?.displayName ?? String(mode).toUpperCase();
}

/**
 * King of the Hill. One square hill zone is live at a time; a player scores
 * 1 point per full second as the zone's sole living occupant (contested =
 * nobody scores; fractional progress resets whenever sole occupancy is
 * broken). The hill relocates round-robin through the map's kothHills list
 * on a fixed interval, with a warning marker at the next spot.
 */
export const KOTH = Object.freeze({
  /** First player to this many hill points wins (else highest at time-out). */
  SCORE_TARGET: 60,
  /** Hill zone edge length in tiles (zones are square). */
  HILL_SIZE_TILES: 2,
  /** Seconds between hill relocations. */
  HILL_MOVE_INTERVAL: 25,
  /** Seconds before relocation that the next-hill warning marker appears. */
  HILL_MOVE_WARNING: 3,
});

/**
 * Sudden-death overtime, all modes: entered when a match would otherwise
 * end in a tie. Everyone respawns fresh with a single life; the first kill
 * wins; if nobody dies before the clock runs out the match is a true draw.
 */
export const OVERTIME = Object.freeze({
  /** Overtime length in seconds. */
  DURATION: 30,
});

/**
 * Mutators: match-wide rule modifiers that activate mid-match and run until
 * the match ends. Each match schedules TWO activations from POOL, no
 * repeats:
 *
 *   1. Mid-match — at a random time inside the 40%–70% elapsed window
 *      (rolled from the match's injectable RNG, so tests can seed it).
 *   2. Final-minute — guaranteed, at the fixed remaining-time thresholds
 *      below (the pre-mutator "final-minute event" system, unchanged).
 *
 * Both get a warning banner WARNING_LEAD_SECONDS before activation, and
 * both run to match end — the 70% window edge lies inside the final
 * minute, so the two mutators can be active simultaneously (stacking is
 * intended; movement multipliers compose multiplicatively).
 */
export const MUTATORS = Object.freeze({
  POOL: [
    'super_speed',
    'grenades_only',
    'infinite_ammo',
    'low_health',
    'big_heads',
    'vampire',
    'turbo_grenades',
    'second_wind',
  ] as const,
  /** Final-minute slot: warning/activation thresholds in seconds REMAINING. */
  WARNING_AT_REMAINING: 65,
  ACTIVATION_AT_REMAINING: 60,
  /** Mid-match slot: activation window as fractions of match time ELAPSED. */
  MIDMATCH_MIN_ELAPSED_FRACTION: 0.4,
  MIDMATCH_MAX_ELAPSED_FRACTION: 0.7,
  /** Seconds between the mid-match warning banner and its activation. */
  WARNING_LEAD_SECONDS: 5,
  /** BASE_SPEED multiplier during super_speed. */
  SUPER_SPEED_MULTIPLIER: 1.6,
  /** Seconds to refill one grenade during grenades_only. */
  GRENADES_ONLY_REFILL_SECONDS: 3.0,
  /** Max-HP cap during low_health (clamps current HP and respawn HP). */
  LOW_HEALTH_HP: 1,
  /** big_heads: hit-validation AABB scale (server + aim-line preview only). */
  BIG_HEADS_HITBOX_SCALE: 1.5,
  /** big_heads: sprite render scale multiplier (client visual only). */
  BIG_HEADS_RENDER_SCALE: 1.3,
  /** vampire: fraction of damage dealt returned to the attacker as healing. */
  VAMPIRE_HEAL_FRACTION: 0.5,
  /** turbo_grenades: multiplier on grenade throw speed. */
  TURBO_GRENADES_SPEED_MULTIPLIER: 1.5,
  /** turbo_grenades: seconds to refill one grenade, up to GRENADE.MAX_COUNT. */
  TURBO_GRENADES_REFILL_SECONDS: 5.0,
  /** second_wind: speed multiplier granted on respawn... */
  SECOND_WIND_SPEED_MULTIPLIER: 1.3,
  /** ...for this many seconds (PlayerState.secondWindTimer). */
  SECOND_WIND_DURATION_SECONDS: 3,
});

/**
 * A mutator's id. Formerly `FinalMinuteEvent` — renamed when the pool grew
 * a second, randomly-timed mid-match activation slot.
 */
export type MutatorId = (typeof MUTATORS.POOL)[number];

/**
 * End-of-match awards. Declaration order IS the priority order: the server
 * walks AWARD_IDS top to bottom and ships the first AWARDS.DISPLAY_COUNT
 * awards that have an outright winner (ties earn nobody the award).
 * Display names are final per the replayability roadmap; thresholds are
 * tunable.
 */
export const AWARD_DEFS = Object.freeze({
  sharpshooter: Object.freeze({ displayName: 'Sharpshooter' }),
  spray_and_pray: Object.freeze({ displayName: 'Spray & Pray' }),
  demolition_man: Object.freeze({ displayName: 'Demolition Man' }),
  buckshot_barber: Object.freeze({ displayName: 'Buckshot Barber' }),
  untouchable: Object.freeze({ displayName: 'Untouchable' }),
  pincushion: Object.freeze({ displayName: 'Pincushion' }),
  pin_puller_no_payoff: Object.freeze({ displayName: 'Pin Puller, No Payoff' }),
  tourist: Object.freeze({ displayName: 'Tourist' }),
});

export type AwardId = keyof typeof AWARD_DEFS;
/** Award ids in priority order (= declaration order of AWARD_DEFS). */
export const AWARD_IDS = Object.keys(AWARD_DEFS) as readonly AwardId[];

export const AWARDS = Object.freeze({
  /** How many awards the results screen shows, by priority. */
  DISPLAY_COUNT: 3,
  /** Sharpshooter requires at least this many shots fired. */
  SHARPSHOOTER_MIN_SHOTS: 10,
  /** Spray & Pray requires at least this many shots fired... */
  SPRAY_AND_PRAY_MIN_SHOTS: 10,
  /** ...and an accuracy strictly below this fraction. */
  SPRAY_AND_PRAY_MAX_ACCURACY: 0.25,
  /** Untouchable requires a kill streak at least this long. */
  UNTOUCHABLE_MIN_STREAK: 3,
  /** Pin Puller requires at least this many grenades thrown (and 0 grenade kills). */
  PIN_PULLER_MIN_THROWN: 3,
});

export const SERVER = Object.freeze({
  TICK_RATE: 20,
  TICK_INTERVAL: 50,
  /**
   * Upper bound on how many queued inputs a player can catch up with in one
   * server tick. Normal play is 1; short client/frame/network bursts may be
   * 2-3. Keeping a cap protects the tick budget without forcing bad acks.
   */
  MAX_INPUTS_PER_PLAYER_PER_TICK: 5,
  REWIND_BUFFER_SECONDS: 1,
  MAX_PLAYERS: 10,
});

export const MAP = Object.freeze({
  TILE_SIZE: 48,
});

/**
 * Per-character active abilities, triggered by the spacebar / on-screen
 * ability button. See server/src/game/match.ts for the state machine and
 * client/src/scenes/game-scene.ts for VFX wiring.
 *
 * Cooldown semantics:
 *   - Bruce: cooldown begins at activation. Total cycle = COOLDOWN seconds.
 *     The 1.2s breath plays out within that window.
 *   - Mighty Man: cooldown begins when the active window ends. Total cycle =
 *     DURATION + COOLDOWN. Death cancels the active window early; cooldown
 *     starts at the death moment in that case.
 */
export const ABILITY = Object.freeze({
  BRUCE_FIRE_BREATH: {
    DURATION: 1.2,
    COOLDOWN: 45,
    /** Reach in tiles. 4 * TILE_SIZE = 192px. */
    RANGE_TILES: 4,
    /**
     * Number of damage ticks fired evenly across the active window. Tick 0
     * fires on the activation server tick (elapsed = 0), tick k fires once
     * elapsed >= k * (DURATION / DAMAGE_TICK_COUNT). At DURATION=1.2 and
     * TICK_COUNT=5 the spacing is 0.24s.
     */
    DAMAGE_TICK_COUNT: 5,
    /**
     * Damage applied to every player currently inside the cone on each
     * damage tick. Distance-independent — the longer a victim stays in the
     * breath, the more ticks they eat. Five ticks at 30 = 150 max damage.
     */
    DAMAGE_PER_TICK: 30,
    /** Segment thickness in pixels — gives the breath some hit forgiveness. */
    WIDTH: 14,
  },
  MIGHTY_MAN_XRAY: {
    DURATION: 7,
    COOLDOWN: 30,
  },
  /**
   * Frost Wizard. Auto-targets the nearest non-self living opponent and
   * pins them in place for DURATION seconds — no movement, no shooting,
   * no grenade, no reload, no counter-ability. Instant cast, no active
   * window: caster's `abilityActiveSeconds` stays 0 and cooldown begins
   * at activation. Cycle = COOLDOWN seconds. If no eligible target
   * exists, the cooldown is not consumed (see Match.tryActivateAbility).
   */
  FROST_WIZARD_FREEZE: {
    DURATION: 2,
    COOLDOWN: 30,
  },
});

/**
 * Character roster. Frame dimensions are sourced from the actual sprite
 * sheets shipped under `client/public/assets/{assetFolder}/`. Each sheet
 * is 6 frames laid horizontally (sheet width = w * 6).
 *
 * Adding a new character: add an entry here, drop the assets into
 * `client/public/assets/<folder>/`, and the BootScene loader picks it up
 * automatically. No further code changes needed for the sprite pipeline.
 *
 * Special abilities are not modeled yet — they will be added in a follow-up.
 */
export const CHARACTERS = Object.freeze({
  mighty_man: {
    id: 'mighty_man',
    displayName: 'Mighty Man',
    spritePrefix: 'mighty_man',
    assetFolder: 'player',
    assetBaseName: 'character',
    hasGun: true,
    idleFrames: {
      down: { w: 11, h: 16 },
      up: { w: 11, h: 16 },
      side: { w: 10, h: 16 },
      'side-left': { w: 10, h: 16 },
    },
    runFrames: {
      down: { w: 11, h: 17 },
      up: { w: 11, h: 17 },
      side: { w: 10, h: 17 },
      'side-left': { w: 10, h: 17 },
    },
  },
  bruce: {
    id: 'bruce',
    displayName: 'Bruce',
    spritePrefix: 'bruce',
    assetFolder: 'enemies',
    assetBaseName: 'zombie',
    hasGun: false,
    idleFrames: {
      down: { w: 13, h: 16 },
      up: { w: 13, h: 15 },
      side: { w: 11, h: 15 },
      'side-left': { w: 11, h: 15 },
    },
    runFrames: {
      down: { w: 12, h: 16 },
      up: { w: 13, h: 16 },
      side: { w: 13, h: 15 },
      'side-left': { w: 13, h: 15 },
    },
  },
  // Frost Wizard intentionally shares Mighty Man's spritePrefix, asset
  // folder, base name, and frame dimensions — he reuses the exact same
  // sheets at runtime and is differentiated visually by the renderer
  // (cyan tint + always-on frost mist + drawn wand overlay). BootScene
  // dedupes sheet loading and animation creation by spritePrefix so this
  // doesn't cause duplicate-key warnings. `hasGun: false` because the
  // wand overlay replaces the gun overlay.
  frost_wizard: {
    id: 'frost_wizard',
    displayName: 'Frost Wizard',
    spritePrefix: 'mighty_man',
    assetFolder: 'player',
    assetBaseName: 'character',
    hasGun: false,
    idleFrames: {
      down: { w: 11, h: 16 },
      up: { w: 11, h: 16 },
      side: { w: 10, h: 16 },
      'side-left': { w: 10, h: 16 },
    },
    runFrames: {
      down: { w: 11, h: 17 },
      up: { w: 11, h: 17 },
      side: { w: 10, h: 17 },
      'side-left': { w: 10, h: 17 },
    },
  },
}) satisfies Readonly<Record<string, CharacterDef>>;

export type CharacterId = keyof typeof CHARACTERS;
export const CHARACTER_IDS = Object.keys(CHARACTERS) as CharacterId[];

/** Convenience alias for SERVER.TICK_RATE */
export const TICK_RATE = SERVER.TICK_RATE;

/** Convenience alias for SERVER.TICK_INTERVAL (milliseconds) */
export const TICK_INTERVAL_MS = SERVER.TICK_INTERVAL;
