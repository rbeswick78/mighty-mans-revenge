import { describe, it, expect, beforeEach } from 'vitest';
import { InputQueue } from './input-queue.js';
import type { PlayerInput } from '@shared/game';

function makeInput(seq: number, overrides: Partial<PlayerInput> = {}): PlayerInput {
  return {
    sequenceNumber: seq,
    moveX: 0,
    moveY: 0,
    aimAngle: 0,
    aimingGun: false,
    firePressed: false,
    aimingGrenade: false,
    throwPressed: false,
    detonatePressed: false,
    sprint: false,
    reload: false,
    tick: 0,
    ...overrides,
  };
}

describe('InputQueue', () => {
  let queue: InputQueue;

  beforeEach(() => {
    queue = new InputQueue();
  });

  it('pushes and drains inputs in order', () => {
    queue.push(makeInput(0));
    queue.push(makeInput(1));
    queue.push(makeInput(2));

    const inputs = queue.drain();

    expect(inputs).toHaveLength(3);
    expect(inputs[0].sequenceNumber).toBe(0);
    expect(inputs[1].sequenceNumber).toBe(1);
    expect(inputs[2].sequenceNumber).toBe(2);
  });

  it('can drain a capped number of inputs and retain the rest', () => {
    queue.push(makeInput(0));
    queue.push(makeInput(1));
    queue.push(makeInput(2));

    const firstBatch = queue.drain(2);
    expect(firstBatch).toHaveLength(2);
    expect(firstBatch[0].sequenceNumber).toBe(0);
    expect(firstBatch[1].sequenceNumber).toBe(1);
    expect(queue.length).toBe(1);

    const secondBatch = queue.drain();
    expect(secondBatch).toHaveLength(1);
    expect(secondBatch[0].sequenceNumber).toBe(2);
    expect(queue.length).toBe(0);
  });

  it('rejects duplicate sequence numbers', () => {
    expect(queue.push(makeInput(1))).toBe(true);
    expect(queue.push(makeInput(1))).toBe(false);

    const inputs = queue.drain();
    expect(inputs).toHaveLength(1);
  });

  it('rejects out-of-order (old) sequence numbers', () => {
    expect(queue.push(makeInput(5))).toBe(true);
    expect(queue.push(makeInput(3))).toBe(false); // older than 5
    expect(queue.push(makeInput(4))).toBe(false); // older than 5

    const inputs = queue.drain();
    expect(inputs).toHaveLength(1);
    expect(inputs[0].sequenceNumber).toBe(5);
  });

  it('drain clears the queue', () => {
    queue.push(makeInput(0));
    queue.push(makeInput(1));

    const first = queue.drain();
    expect(first).toHaveLength(2);

    const second = queue.drain();
    expect(second).toHaveLength(0);
  });

  it('empty queue returns empty array', () => {
    const inputs = queue.drain();
    expect(inputs).toEqual([]);
  });

  it('tracks queue length', () => {
    expect(queue.length).toBe(0);

    queue.push(makeInput(0));
    expect(queue.length).toBe(1);

    queue.push(makeInput(1));
    expect(queue.length).toBe(2);

    queue.drain();
    expect(queue.length).toBe(0);
  });

  it('accepts inputs after drain resets the queue', () => {
    queue.push(makeInput(0));
    queue.push(makeInput(1));
    queue.drain();

    // After draining, new inputs with higher sequence numbers should be accepted
    expect(queue.push(makeInput(2))).toBe(true);
    expect(queue.push(makeInput(3))).toBe(true);

    const inputs = queue.drain();
    expect(inputs).toHaveLength(2);
  });

  it('still rejects old sequence numbers after drain', () => {
    queue.push(makeInput(5));
    queue.drain();

    // lastSequence is still 5 after drain, so 3 should be rejected
    expect(queue.push(makeInput(3))).toBe(false);
    expect(queue.push(makeInput(6))).toBe(true);
  });

  it('preserves input data through push and drain', () => {
    const input = makeInput(0, {
      moveX: 1,
      moveY: -1,
      aimAngle: Math.PI / 4,
      aimingGun: true,
      firePressed: true,
      sprint: true,
    });

    queue.push(input);
    const drained = queue.drain();

    expect(drained[0].moveX).toBe(1);
    expect(drained[0].moveY).toBe(-1);
    expect(drained[0].aimAngle).toBe(Math.PI / 4);
    expect(drained[0].aimingGun).toBe(true);
    expect(drained[0].firePressed).toBe(true);
    expect(drained[0].sprint).toBe(true);
  });
});
