import { CREW_BATTLE } from '@shared/game';
import type { BotDifficulty, GameModeType, MutatorId, PlayerId } from '@shared/game';

export interface CrewQueueEntry {
  playerId: PlayerId;
  nickname: string;
  joinedAt: number;
  /** The first entrant is captain; their validated settings author the match. */
  difficulty: BotDifficulty;
  gameMode: GameModeType | null;
  mutatorId: MutatorId | null;
}

/**
 * Tick-driven one-or-two-human Crew queue. A full human crew launches at once;
 * otherwise the first entrant gets a short, visible ally window before Rusty
 * fills the open blue-side slot.
 */
export class CrewQueue {
  private readonly queue: CrewQueueEntry[] = [];
  private launchTimerSeconds: number | null = null;

  addPlayer(entry: Omit<CrewQueueEntry, 'joinedAt'>): boolean {
    if (this.isPlayerQueued(entry.playerId) || this.queue.length >= CREW_BATTLE.MAX_HUMANS) {
      return false;
    }
    this.queue.push({ ...entry, joinedAt: Date.now() });
    if (this.launchTimerSeconds === null) {
      this.launchTimerSeconds = CREW_BATTLE.ALLY_WAIT_SECONDS;
    }
    return true;
  }

  removePlayer(playerId: PlayerId): boolean {
    const index = this.queue.findIndex((entry) => entry.playerId === playerId);
    if (index < 0) return false;
    this.queue.splice(index, 1);
    if (this.queue.length === 0) {
      this.launchTimerSeconds = null;
    } else if (index === 0) {
      // The remaining fighter just became captain; grant their own full window.
      this.launchTimerSeconds = CREW_BATTLE.ALLY_WAIT_SECONDS;
    }
    return true;
  }

  tick(dt: number): CrewQueueEntry[] | null {
    if (this.queue.length >= CREW_BATTLE.MAX_HUMANS) return this.takeGroup();
    if (this.queue.length === 0 || this.launchTimerSeconds === null) return null;
    if (Number.isFinite(dt) && dt > 0) {
      this.launchTimerSeconds = Math.max(0, this.launchTimerSeconds - dt);
    }
    return this.launchTimerSeconds === 0 ? this.takeGroup() : null;
  }

  getEntries(): readonly CrewQueueEntry[] {
    return this.queue;
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  getLaunchInMs(): number | undefined {
    return this.launchTimerSeconds === null ? undefined : this.launchTimerSeconds * 1000;
  }

  isPlayerQueued(playerId: PlayerId): boolean {
    return this.queue.some((entry) => entry.playerId === playerId);
  }

  private takeGroup(): CrewQueueEntry[] {
    const group = this.queue.splice(0, CREW_BATTLE.MAX_HUMANS);
    this.launchTimerSeconds = null;
    return group;
  }
}
