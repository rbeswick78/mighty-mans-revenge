import type { PlayerId, Vec2 } from '@shared/types/common.js';
import type { SerializedPlayerState } from '@shared/types/network.js';
import type { InterpolatedState } from './types.js';

/** Stop extrapolating if we haven't received an update in this many ms. */
const MAX_EXTRAPOLATION_MS = 200;

/**
 * Maximum number of authoritative snapshots we retain per remote entity.
 * With 20 ticks/sec server rate and a 100ms render delay, two states are
 * the absolute minimum to interpolate; we keep a few extra to absorb
 * jitter and out-of-order arrivals.
 */
const MAX_BUFFER_SIZE = 12;

interface BufferedState {
  position: Vec2;
  velocity: Vec2;
  aimAngle: number;
  health: number;
  ammo: number;
  grenades: number;
  isSprinting: boolean;
  isDead: boolean;
  isReloading: boolean;
  stamina: number;
  respawnTimer: number;
  invulnerableTimer: number;
  score: number;
  deaths: number;
  nickname: string;
  /** Local receive time in ms (performance.now()). */
  timestamp: number;
  serverTick: number;
}

interface EntityBuffer {
  states: BufferedState[];
  /** Highest serverTick we've already accepted; used to drop late/stale arrivals. */
  highestTick: number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = b - a;
  // Normalize to [-PI, PI]
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  return a + diff * t;
}

function toInterpolated(s: BufferedState): InterpolatedState {
  return {
    position: { x: s.position.x, y: s.position.y },
    velocity: { x: s.velocity.x, y: s.velocity.y },
    aimAngle: s.aimAngle,
    health: s.health,
    ammo: s.ammo,
    grenades: s.grenades,
    isSprinting: s.isSprinting,
    isDead: s.isDead,
    isReloading: s.isReloading,
    stamina: s.stamina,
    respawnTimer: s.respawnTimer,
    invulnerableTimer: s.invulnerableTimer,
    score: s.score,
    deaths: s.deaths,
    nickname: s.nickname,
  };
}

export class EntityInterpolation {
  private buffers = new Map<PlayerId, EntityBuffer>();

  /**
   * Push a new authoritative state for a remote entity.
   * Drops out-of-order arrivals (UDP can reorder packets), keeps a small
   * sliding window of recent states for the interpolator to pick from.
   */
  pushState(
    playerId: PlayerId,
    state: SerializedPlayerState,
    serverTick: number,
  ): void {
    let buffer = this.buffers.get(playerId);
    if (!buffer) {
      buffer = { states: [], highestTick: -1 };
      this.buffers.set(playerId, buffer);
    }

    // Reject duplicates and out-of-order arrivals. Without this, a stale
    // packet arriving after a fresher one would jerk the entity backwards.
    if (serverTick <= buffer.highestTick) return;
    buffer.highestTick = serverTick;

    const buffered: BufferedState = {
      position: { x: state.position.x, y: state.position.y },
      velocity: { x: state.velocity.x, y: state.velocity.y },
      aimAngle: state.aimAngle,
      health: state.health,
      ammo: state.ammo,
      grenades: state.grenades,
      isSprinting: state.isSprinting,
      isDead: state.isDead,
      isReloading: state.isReloading,
      stamina: state.stamina,
      respawnTimer: state.respawnTimer,
      invulnerableTimer: state.invulnerableTimer,
      score: state.score,
      deaths: state.deaths,
      nickname: state.nickname,
      timestamp: performance.now(),
      serverTick,
    };

    buffer.states.push(buffered);
    if (buffer.states.length > MAX_BUFFER_SIZE) {
      buffer.states.shift();
    }
  }

  /**
   * Get the interpolated state for a remote entity at the given render time.
   *
   * Picks the two buffered states whose receive timestamps bracket
   * `renderTime` and lerps between them. The caller renders ~2 ticks
   * behind real-time so typical UDP jitter (±20-30ms) lands inside the
   * buffered window instead of forcing a snap.
   */
  getInterpolatedState(
    playerId: PlayerId,
    renderTime: number,
  ): InterpolatedState | null {
    const buffer = this.buffers.get(playerId);
    if (!buffer || buffer.states.length === 0) return null;

    const states = buffer.states;
    const newest = states[states.length - 1];

    // Single state — nothing to interpolate against.
    if (states.length === 1) {
      return toInterpolated(newest);
    }

    // Render time newer than newest sample. Briefly hold at last known
    // state; if we go too long without an update, freeze hard.
    if (renderTime >= newest.timestamp) {
      if (renderTime - newest.timestamp > MAX_EXTRAPOLATION_MS) {
        return toInterpolated(newest);
      }
      return toInterpolated(newest);
    }

    // Render time older than oldest sample (we're still filling the buffer).
    const oldest = states[0];
    if (renderTime <= oldest.timestamp) {
      return toInterpolated(oldest);
    }

    // Find the pair of consecutive states bracketing renderTime.
    for (let i = 0; i < states.length - 1; i++) {
      const prev = states[i];
      const curr = states[i + 1];
      if (renderTime >= prev.timestamp && renderTime <= curr.timestamp) {
        const duration = curr.timestamp - prev.timestamp;
        if (duration <= 0) {
          return toInterpolated(curr);
        }
        const t = (renderTime - prev.timestamp) / duration;
        return {
          position: {
            x: lerp(prev.position.x, curr.position.x, t),
            y: lerp(prev.position.y, curr.position.y, t),
          },
          velocity: { x: curr.velocity.x, y: curr.velocity.y },
          aimAngle: lerpAngle(prev.aimAngle, curr.aimAngle, t),
          health: curr.health, // discrete -- don't interpolate
          ammo: curr.ammo,
          grenades: curr.grenades,
          isSprinting: curr.isSprinting,
          isDead: curr.isDead,
          isReloading: curr.isReloading,
          stamina: curr.stamina,
          respawnTimer: curr.respawnTimer,
          invulnerableTimer: curr.invulnerableTimer,
          score: curr.score,
          deaths: curr.deaths,
          nickname: curr.nickname,
        };
      }
    }

    // Fallback (shouldn't reach here given the bracketing checks above).
    return toInterpolated(newest);
  }

  /** Remove a disconnected entity from the buffer. */
  removeEntity(playerId: PlayerId): void {
    this.buffers.delete(playerId);
  }
}
