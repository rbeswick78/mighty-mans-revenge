import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GameLoop, type TickCallback } from './game-loop.js';

// Mock the logger to avoid noisy output during tests
vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

describe('GameLoop', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs callback at correct frequency', () => {
    const callback = vi.fn();
    const tickRate = 20; // 50ms interval
    const loop = new GameLoop(callback, tickRate);

    loop.start();

    // Advance 200ms — should fire 4 ticks (200 / 50 = 4)
    vi.advanceTimersByTime(200);

    loop.stop();

    expect(callback).toHaveBeenCalledTimes(4);
  });

  it('increments tick counter on each tick', () => {
    const ticks: number[] = [];
    const callback: TickCallback = (_dt, tick) => {
      ticks.push(tick);
    };
    const loop = new GameLoop(callback, 20);

    loop.start();
    vi.advanceTimersByTime(150); // 3 ticks
    loop.stop();

    expect(ticks).toEqual([1, 2, 3]);
  });

  it('can be started and stopped', () => {
    const callback = vi.fn();
    const loop = new GameLoop(callback, 20);

    expect(loop.isRunning()).toBe(false);

    loop.start();
    expect(loop.isRunning()).toBe(true);

    loop.stop();
    expect(loop.isRunning()).toBe(false);

    // No more ticks after stop
    const countBeforeAdvance = callback.mock.calls.length;
    vi.advanceTimersByTime(200);
    expect(callback).toHaveBeenCalledTimes(countBeforeAdvance);
  });

  it('does not start twice if already running', () => {
    const callback = vi.fn();
    const loop = new GameLoop(callback, 20);

    loop.start();
    loop.start(); // second call should be a no-op

    vi.advanceTimersByTime(100); // 2 ticks
    loop.stop();

    // Should still get exactly 2 ticks, not double
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('does not error if stopped when not running', () => {
    const callback = vi.fn();
    const loop = new GameLoop(callback, 20);

    // Should not throw
    expect(() => loop.stop()).not.toThrow();
    expect(loop.isRunning()).toBe(false);
  });

  it('multiple start/stop cycles work', () => {
    const callback = vi.fn();
    const loop = new GameLoop(callback, 20);

    // First cycle
    loop.start();
    vi.advanceTimersByTime(100); // 2 ticks
    loop.stop();

    expect(callback).toHaveBeenCalledTimes(2);

    // Second cycle — tick counter resets
    loop.start();
    vi.advanceTimersByTime(150); // 3 ticks
    loop.stop();

    expect(callback).toHaveBeenCalledTimes(5); // 2 + 3
  });

  it('exposes tick_number', () => {
    const callback = vi.fn();
    const loop = new GameLoop(callback, 20);

    loop.start();
    expect(loop.tick_number).toBe(0);

    vi.advanceTimersByTime(50); // 1 tick
    expect(loop.tick_number).toBe(1);

    vi.advanceTimersByTime(100); // 2 more ticks
    expect(loop.tick_number).toBe(3);

    loop.stop();
  });

  it('resets tick counter on restart', () => {
    const callback = vi.fn();
    const loop = new GameLoop(callback, 20);

    loop.start();
    vi.advanceTimersByTime(100); // 2 ticks
    expect(loop.tick_number).toBe(2);
    loop.stop();

    loop.start();
    expect(loop.tick_number).toBe(0);
    loop.stop();
  });

  it('tracks processing time', () => {
    let callCount = 0;
    const callback: TickCallback = () => {
      callCount++;
      // Simulate work by advancing performance.now() via a small busy loop
      // With fake timers, performance.now() is mocked, so we just verify the property exists
    };
    const loop = new GameLoop(callback, 20);

    loop.start();
    vi.advanceTimersByTime(50); // 1 tick
    loop.stop();

    // lastProcessingTimeMs and avgProcessingTimeMs should be non-negative numbers
    expect(loop.lastProcessingTimeMs).toBeGreaterThanOrEqual(0);
    expect(loop.avgProcessingTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('provides delta time in seconds to callback', () => {
    const deltaTimes: number[] = [];
    const callback: TickCallback = (dt) => {
      deltaTimes.push(dt);
    };
    const loop = new GameLoop(callback, 20);

    loop.start();
    vi.advanceTimersByTime(50); // 1 tick at 50ms interval
    loop.stop();

    expect(deltaTimes.length).toBe(1);
    // dt should be approximately 0.05 seconds (50ms)
    expect(deltaTimes[0]).toBeGreaterThan(0);
  });

  it('uses SERVER.TICK_RATE as default when no tickRate provided', () => {
    const callback = vi.fn();
    // Default tick rate is 20 (from SERVER.TICK_RATE), so interval is 50ms
    const loop = new GameLoop(callback);

    loop.start();
    vi.advanceTimersByTime(100); // 2 ticks at 50ms
    loop.stop();

    expect(callback).toHaveBeenCalledTimes(2);
  });
});
