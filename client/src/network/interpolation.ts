import type { PlayerId, Vec2 } from '@shared/types/common.js';
import type { SerializedPlayerState } from '@shared/types/network.js';
import type { InterpolatedState } from './types.js';

/** Stop extrapolating if we haven't received an update in this many ms. */
const MAX_EXTRAPOLATION_MS = 200;

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
  invulnerableTimer: number;
  score: number;
  deaths: number;
  nickname: string;
  timestamp: number; // local receive time in ms
  serverTick: number;
}

interface EntityBuffer {
  states: [BufferedState] | [BufferedState, BufferedState];
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
   * Keeps only the two most recent states for interpolation.
   */
  pushState(
    playerId: PlayerId,
    state: SerializedPlayerState,
    serverTick: number,
  ): void {
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
      invulnerableTimer: state.invulnerableTimer,
      score: state.score,
      deaths: state.deaths,
      nickname: state.nickname,
      timestamp: performance.now(),
      serverTick,
    };

    const existing = this.buffers.get(playerId);
    if (!existing) {
      this.buffers.set(playerId, { states: [buffered] });
    } else {
      // Keep the most recent as "previous", new one as "current"
      const prev = existing.states.length === 2
        ? existing.states[1]
        : existing.states[0];
      existing.states = [prev, buffered];
    }
  }

  /**
   * Get the interpolated state for a remote entity at the given render time.
   *
   * Entity interpolation intentionally renders other players ONE TICK BEHIND
   * real-time. The caller provides `renderTime` which should be
   * `performance.now() - tickIntervalMs` to achieve this buffering.
   */
  getInterpolatedState(
    playerId: PlayerId,
    renderTime: number,
  ): InterpolatedState | null {
    const buffer = this.buffers.get(playerId);
    if (!buffer) return null;

    const { states } = buffer;

    if (states.length === 1) {
      return toInterpolated(states[0]);
    }

    const [prev, curr] = states;

    // If no update for too long, freeze at last known position
    if (renderTime - curr.timestamp > MAX_EXTRAPOLATION_MS) {
      return toInterpolated(curr);
    }

    // Compute interpolation factor between previous and current
    const duration = curr.timestamp - prev.timestamp;
    if (duration <= 0) {
      return toInterpolated(curr);
    }

    const t = Math.max(0, Math.min(1, (renderTime - prev.timestamp) / duration));

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
      invulnerableTimer: curr.invulnerableTimer,
      score: curr.score,
      deaths: curr.deaths,
      nickname: curr.nickname,
    };
  }

  /** Remove a disconnected entity from the buffer. */
  removeEntity(playerId: PlayerId): void {
    this.buffers.delete(playerId);
  }
}
