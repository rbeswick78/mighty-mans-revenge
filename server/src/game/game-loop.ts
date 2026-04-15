import { SERVER } from '@shared/game';
import { logger } from '../utils/logger.js';

export type TickCallback = (deltaTime: number, tick: number) => void;

export class GameLoop {
  private readonly tickRate: number;
  private readonly tickIntervalMs: number;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private currentTick = 0;
  private expectedTime = 0;
  private lastTickTime = 0;
  private _isRunning = false;

  /** Rolling average of tick processing time in ms. */
  private _avgProcessingTimeMs = 0;
  /** Most recent tick processing time in ms. */
  private _lastProcessingTimeMs = 0;
  /** Measured tick rate over the last second. */
  private _measuredTickRate = 0;
  private ticksThisSecond = 0;
  private secondTimer = 0;
  private _lastTickWallTime = 0;

  constructor(
    private readonly callback: TickCallback,
    tickRate: number = SERVER.TICK_RATE,
  ) {
    this.tickRate = tickRate;
    this.tickIntervalMs = 1000 / tickRate;
  }

  start(): void {
    if (this._isRunning) return;
    this._isRunning = true;
    this.currentTick = 0;
    this.expectedTime = performance.now();
    this.lastTickTime = this.expectedTime;
    this.ticksThisSecond = 0;
    this.secondTimer = 0;

    logger.info({ tickRate: this.tickRate }, 'Game loop starting');

    this.intervalId = setInterval(() => {
      this.tick();
    }, this.tickIntervalMs);
  }

  stop(): void {
    if (!this._isRunning) return;
    this._isRunning = false;

    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    logger.info({ totalTicks: this.currentTick }, 'Game loop stopped');
  }

  isRunning(): boolean {
    return this._isRunning;
  }

  get tick_number(): number {
    return this.currentTick;
  }

  get avgProcessingTimeMs(): number {
    return this._avgProcessingTimeMs;
  }

  get lastProcessingTimeMs(): number {
    return this._lastProcessingTimeMs;
  }

  get measuredTickRate(): number {
    return this._measuredTickRate;
  }

  /** Wall-clock timestamp (Date.now()) of the last completed tick. */
  get lastTickWallTime(): number {
    return this._lastTickWallTime;
  }

  private tick(): void {
    const now = performance.now();

    // Drift compensation: compute how many ticks we should have processed
    this.expectedTime += this.tickIntervalMs;
    const drift = now - this.expectedTime;

    // If we've drifted significantly behind, catch up the expected time
    // rather than running many ticks at once
    if (drift > this.tickIntervalMs * 5) {
      logger.warn({ driftMs: drift }, 'Game loop drifted significantly, resetting timer');
      this.expectedTime = now;
    }

    // Use a FIXED dt equal to the tick interval, not wall-clock delta.
    // The client uses the same fixed dt for prediction and reconciliation,
    // so any mismatch would cause constant small corrections (bounce-back).
    // Wall-clock jitter is absorbed by drift compensation above.
    const dt = this.tickIntervalMs / 1000;
    this.lastTickTime = now;

    const tickStart = performance.now();

    this.currentTick++;
    this.callback(dt, this.currentTick);

    const tickEnd = performance.now();
    this._lastTickWallTime = Date.now();
    this._lastProcessingTimeMs = tickEnd - tickStart;
    // Exponential moving average (alpha = 0.1)
    this._avgProcessingTimeMs =
      this._avgProcessingTimeMs * 0.9 + this._lastProcessingTimeMs * 0.1;

    // Measure actual tick rate
    this.ticksThisSecond++;
    this.secondTimer += dt;
    if (this.secondTimer >= 1) {
      this._measuredTickRate = this.ticksThisSecond;
      this.ticksThisSecond = 0;
      this.secondTimer -= 1;
    }
  }
}
