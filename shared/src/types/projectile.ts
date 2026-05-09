import { PlayerId, Vec2 } from './common.js';

export interface BulletTrail {
  startPos: Vec2;
  endPos: Vec2;
  shooterId: PlayerId;
  timestamp: number;
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
