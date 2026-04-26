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
  DAMAGE: 80,
  BLAST_RADIUS: 96,
  /**
   * Fallback fuse — grenades wait for a manual right-click detonation,
   * but auto-explode after this many seconds if the player forgets or dies.
   */
  SAFETY_FUSE: 5.0,
  THROW_SPEED: 300,
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
  TIME_LIMIT: 300,
  COUNTDOWN_DURATION: 3,
});

export const SERVER = Object.freeze({
  TICK_RATE: 20,
  TICK_INTERVAL: 50,
  REWIND_BUFFER_SECONDS: 1,
  MAX_PLAYERS: 10,
});

export const MAP = Object.freeze({
  TILE_SIZE: 48,
});

/** Convenience alias for SERVER.TICK_RATE */
export const TICK_RATE = SERVER.TICK_RATE;

/** Convenience alias for SERVER.TICK_INTERVAL (milliseconds) */
export const TICK_INTERVAL_MS = SERVER.TICK_INTERVAL;
