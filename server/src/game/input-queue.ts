import type { PlayerInput } from '@shared/game';

export class InputQueue {
  private queue: PlayerInput[] = [];
  private lastSequence = -1;

  /** Add an input to the queue. Rejects duplicates and out-of-order inputs. */
  push(input: PlayerInput): boolean {
    if (input.sequenceNumber <= this.lastSequence) {
      return false;
    }
    this.lastSequence = input.sequenceNumber;
    this.queue.push(input);
    return true;
  }

  /** Return queued inputs in order and clear them from the queue. */
  drain(maxCount?: number): PlayerInput[] {
    if (maxCount === undefined || maxCount >= this.queue.length) {
      const inputs = this.queue;
      this.queue = [];
      return inputs;
    }

    const inputs = this.queue.slice(0, maxCount);
    this.queue = this.queue.slice(maxCount);
    return inputs;
  }

  /** Number of inputs currently queued. */
  get length(): number {
    return this.queue.length;
  }
}
