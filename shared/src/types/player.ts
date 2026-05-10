import { PlayerId, Vec2, Tick } from './common.js';
import type { CharacterId } from '../config/game.js';

export interface PlayerState {
  id: PlayerId;
  /**
   * The character this player has chosen on the select screen. Null until
   * the player locks in (or is auto-locked at timeout). Once a match
   * transitions to COUNTDOWN this is guaranteed non-null on every player.
   */
  characterId: CharacterId | null;
  position: Vec2;
  velocity: Vec2;
  aimAngle: number;
  health: number;
  maxHealth: number;
  ammo: number;
  isReloading: boolean;
  reloadTimer: number;
  /** Number of grenades the player can still throw. */
  grenades: number;
  /**
   * Accumulating regen timer for the grenades_only event. Only ticks when
   * grenades_only is active and player.grenades < GRENADE.MAX_COUNT.
   */
  grenadeRegenSeconds: number;
  isSprinting: boolean;
  stamina: number;
  isDead: boolean;
  respawnTimer: number;
  invulnerableTimer: number;
  lastProcessedInput: number;
  score: number;
  deaths: number;
  nickname: string;
  /**
   * Per-character active ability state. See ABILITY in shared/config/game.ts
   * for tunables and server/src/game/match.ts for the state machine.
   *
   *   abilityActiveSeconds > 0: ability is firing right now (Bruce breathing,
   *     Mighty Man's x-ray window). Counts down each tick.
   *   abilityCooldownSeconds > 0: ability is on cooldown. Counts down each
   *     tick; only ticks while abilityActiveSeconds <= 0.
   *
   * For Bruce: movement is pinned during the active window, but aim is
   * still live so the breath cone can sweep with the cursor. The server
   * uses player.aimAngle (continuously updated from input) as the cone
   * direction; abilityLockedAim retains the activation-time angle for
   * diagnostics. The per-cast hit set (preventing double-tap on a single
   * victim during one breath) is held server-side on Match, not on this
   * shared PlayerState.
   */
  abilityActiveSeconds: number;
  abilityCooldownSeconds: number;
  abilityLockedAim: number;
}

export interface PlayerInput {
  sequenceNumber: number;
  moveX: number;
  moveY: number;
  aimAngle: number;
  /** Left mouse button is currently held (drawing the bullet aim line). */
  aimingGun: boolean;
  /** Left mouse button was released since the previous input — fire a burst. */
  firePressed: boolean;
  /**
   * Right mouse button is currently held with no live grenade (drawing the
   * grenade aim arc). False when a grenade is in flight (the button is now in
   * detonate mode).
   */
  aimingGrenade: boolean;
  /**
   * Right mouse button was released after an aim phase — throw the grenade.
   * Only meaningful when no grenade is currently in flight for this player.
   */
  throwPressed: boolean;
  /**
   * Right mouse button was pressed while a live grenade exists — detonate it.
   */
  detonatePressed: boolean;
  sprint: boolean;
  reload: boolean;
  /**
   * Spacebar / ability-button pressed-edge this tick. Activates the player's
   * character-specific ability if it's off cooldown and not currently active.
   */
  abilityPressed: boolean;
  tick: Tick;
}

export interface PlayerStats {
  kills: number;
  deaths: number;
  shotsFired: number;
  shotsHit: number;
  damageDealt: number;
  damageTaken: number;
  grenadesThrown: number;
  grenadeKills: number;
  longestKillStreak: number;
}
