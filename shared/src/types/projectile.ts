import { PlayerId, Vec2 } from './common.js';
import type { WeaponId } from '../config/game.js';

export interface BulletTrail {
  startPos: Vec2;
  endPos: Vec2;
  shooterId: PlayerId;
  timestamp: number;
  /**
   * Weapon that produced this trail. A shotgun blast broadcasts one trail
   * per pellet; the client renders every trail but plays the muzzle
   * flash/SFX once per blast (grouped by shooter + timestamp).
   */
  weaponId: WeaponId;
}

/**
 * Jack's thrown axe — a straight-line, server-simulated projectile
 * (ABILITY.JACK_AXE_THROW). No client damage prediction, same contract as
 * grenades: the server broadcasts the authoritative in-flight list every
 * snapshot and the client mirrors it with sprites. An axe vanishing from
 * the list means it resolved (hit a player, hit a wall, or reached max
 * range) — the client plays its landing animation at the last-known spot.
 */
export interface AxeState {
  id: string;
  position: Vec2;
  velocity: Vec2;
  throwerId: PlayerId;
  /** Flight direction in radians — drives the client's sprite variant. */
  angle: number;
  /** Px flown so far; the server retires the axe at RANGE_TILES * TILE_SIZE. */
  distanceTraveled: number;
}

/**
 * One punch swing, resolved instantly on the server tick it was thrown.
 * Punches produce no bullet trails; instead the tick's swings ride the
 * gameState message as a transient array (same per-message delivery as
 * bulletTrails, so a swing can't be swallowed by bursty snapshots) and the
 * client plays the puncher's attack animation + SFX off each entry.
 */
export interface PunchEvent {
  playerId: PlayerId;
  /** Punch origin (the puncher's position at swing time). */
  position: Vec2;
  /** Swing direction in radians — buckets into the attack anim facing. */
  aimAngle: number;
  /** True if the swing connected with at least one victim (impact SFX). */
  hit: boolean;
}

export interface GrenadeState {
  id: string;
  position: Vec2;
  velocity: Vec2;
  /**
   * Fallback timer (seconds remaining) before auto-detonation. The thrower is
   * expected to manually detonate via right-click; this timer is only here so
   * that a forgotten or orphaned grenade still resolves.
   */
  safetyFuseTimer: number;
  throwerId: PlayerId;
  /**
   * True when the grenade was thrown by a Mighty Man whose x-ray vision was
   * active at throw time. Sticky for the grenade's lifetime: physics skip
   * wall-bounce, and the explosion's line-of-sight check is bypassed so it
   * damages targets through walls. Stamped server-side at throw, broadcast
   * to clients so prediction and rendering match the authoritative path.
   */
  piercing: boolean;
}
