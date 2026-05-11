import type { CharacterDef } from '../types/character.js';

export const PLAYER = Object.freeze({
  BASE_SPEED: 200,
  SPRINT_SPEED: 320,
  SPRINT_DURATION: 3,
  SPRINT_RECHARGE_RATE: 1,
  MAX_HEALTH: 100,
  HITBOX_WIDTH: 24,
  HITBOX_HEIGHT: 24,
});

export const GUN = Object.freeze({
  DAMAGE_MIN: 8,
  DAMAGE_MAX: 25,
  FALLOFF_RANGE_MIN: 64,
  FALLOFF_RANGE_MAX: 400,
  /** Number of rounds in a single burst fired on left-click release. */
  BURST_SIZE: 3,
  /** Seconds between each round in a burst. */
  BURST_INTERVAL: 0.15,
  MAGAZINE_SIZE: 30,
  RELOAD_TIME: 2.0,
});

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
  RESPAWN_TIME: 15,
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

export const EVENT = Object.freeze({
  /**
   * Final-minute events: when the match timer crosses these thresholds (in
   * seconds remaining), the server fires a warning, then activates a
   * randomly chosen modifier that runs until match end.
   */
  WARNING_AT_REMAINING: 65,
  ACTIVATION_AT_REMAINING: 60,
  POOL: ['super_speed', 'grenades_only', 'infinite_ammo', 'low_health'] as const,
  /** BASE_SPEED multiplier during super_speed. */
  SUPER_SPEED_MULTIPLIER: 1.6,
  /** Seconds to refill one grenade during grenades_only. */
  GRENADES_ONLY_REFILL_SECONDS: 3.0,
  /** Max-HP cap during low_health (clamps current HP and respawn HP). */
  LOW_HEALTH_HP: 1,
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
