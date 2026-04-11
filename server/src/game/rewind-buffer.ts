import {
  type PlayerId,
  type Vec2,
  type PlayerState,
  SERVER,
  vecLerp,
} from '@shared/game';

export interface RewindPlayerState {
  position: Vec2;
  hitbox: { width: number; height: number };
}

export interface RewindState {
  tick: number;
  timestamp: number;
  players: Map<PlayerId, RewindPlayerState>;
}

const BUFFER_SIZE = SERVER.TICK_RATE * SERVER.REWIND_BUFFER_SECONDS;

export class RewindBuffer {
  private buffer: (RewindState | null)[];
  private writeIndex = 0;
  private count = 0;

  constructor(private readonly size: number = BUFFER_SIZE) {
    this.buffer = new Array<RewindState | null>(this.size).fill(null);
  }

  saveState(tick: number, timestamp: number, players: Map<PlayerId, PlayerState>): void {
    const playerMap = new Map<PlayerId, RewindPlayerState>();
    for (const [id, state] of players) {
      playerMap.set(id, {
        position: { x: state.position.x, y: state.position.y },
        hitbox: {
          width: state.maxHealth !== undefined ? 24 : 24, // always use hitbox from PLAYER constants
          height: 24,
        },
      });
    }

    this.buffer[this.writeIndex] = {
      tick,
      timestamp,
      players: playerMap,
    };

    this.writeIndex = (this.writeIndex + 1) % this.size;
    if (this.count < this.size) {
      this.count++;
    }
  }

  getStateAtTick(tick: number): RewindState | null {
    for (let i = 0; i < this.count; i++) {
      const idx = (this.writeIndex - 1 - i + this.size) % this.size;
      const entry = this.buffer[idx];
      if (entry && entry.tick === tick) {
        return entry;
      }
    }
    return null;
  }

  getStateAtTime(targetTime: number): RewindState | null {
    if (this.count === 0) return null;

    // Collect all valid entries sorted by timestamp
    const entries: RewindState[] = [];
    for (let i = 0; i < this.count; i++) {
      const idx = (this.writeIndex - 1 - i + this.size) % this.size;
      const entry = this.buffer[idx];
      if (entry) entries.push(entry);
    }

    if (entries.length === 0) return null;

    // Sort by timestamp ascending
    entries.sort((a, b) => a.timestamp - b.timestamp);

    // If target is before or at the earliest entry, return earliest
    if (targetTime <= entries[0].timestamp) {
      return entries[0];
    }

    // If target is after or at the latest entry, return latest
    if (targetTime >= entries[entries.length - 1].timestamp) {
      return entries[entries.length - 1];
    }

    // Find the two entries that bracket the target time
    for (let i = 0; i < entries.length - 1; i++) {
      const before = entries[i];
      const after = entries[i + 1];

      if (targetTime >= before.timestamp && targetTime <= after.timestamp) {
        // Interpolate between the two states
        const timeDelta = after.timestamp - before.timestamp;
        if (timeDelta === 0) return before;

        const t = (targetTime - before.timestamp) / timeDelta;
        return this.interpolateStates(before, after, t);
      }
    }

    // Fallback — shouldn't reach here
    return entries[entries.length - 1];
  }

  private interpolateStates(
    before: RewindState,
    after: RewindState,
    t: number,
  ): RewindState {
    const players = new Map<PlayerId, RewindPlayerState>();

    // Interpolate positions for players that exist in both states
    for (const [id, beforePlayer] of before.players) {
      const afterPlayer = after.players.get(id);
      if (afterPlayer) {
        players.set(id, {
          position: vecLerp(beforePlayer.position, afterPlayer.position, t),
          hitbox: beforePlayer.hitbox,
        });
      } else {
        // Player only in before state — keep their position
        players.set(id, { ...beforePlayer });
      }
    }

    // Include players only in after state
    for (const [id, afterPlayer] of after.players) {
      if (!players.has(id)) {
        players.set(id, { ...afterPlayer });
      }
    }

    return {
      tick: Math.round(before.tick + (after.tick - before.tick) * t),
      timestamp: before.timestamp + (after.timestamp - before.timestamp) * t,
      players,
    };
  }

  /** Visible for testing. */
  getCount(): number {
    return this.count;
  }
}
