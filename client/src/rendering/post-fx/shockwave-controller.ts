import {
  acquirePooledEffectSlot,
  WORLD_RENDER_QUALITY_BUDGETS,
  type WorldRenderQualityBudget,
} from '../dynamic-world-rendering.js';
import { worldPoint, type GameplayCoordinateSpace } from '../gameplay-coordinate-space.js';
import { CrtPipeline, MAX_SHOCKWAVES } from './crt-pipeline.js';

const SHOCKWAVE_DURATION_MS = 350;
const SHOCKWAVE_FINAL_RADIUS_PX = 192;
const SHOCKWAVE_PEAK_STRENGTH_PX = 12;

interface Shockwave {
  x: number;
  y: number;
  ageMs: number;
  active: boolean;
}

/** Pooled world-space shockwaves projected through the Batch 19 boundary. */
export class ShockwaveController {
  private readonly pool: Shockwave[] = [];
  private readonly originsXY = new Float32Array(MAX_SHOCKWAVES * 2);
  private readonly radii = new Float32Array(MAX_SHOCKWAVES);
  private readonly strengths = new Float32Array(MAX_SHOCKWAVES);
  private nextSlot = 0;

  constructor(
    private readonly coordinates: GameplayCoordinateSpace,
    private readonly qualityBudget: () => WorldRenderQualityBudget = () =>
      WORLD_RENDER_QUALITY_BUDGETS.full,
  ) {
    for (let i = 0; i < MAX_SHOCKWAVES; i++) {
      this.pool.push({ x: 0, y: 0, ageMs: 0, active: false });
    }
  }

  trigger(x: number, y: number): void {
    const limit = this.qualityBudget().shockwaves;
    const slot = acquirePooledEffectSlot(this.pool, this.nextSlot, limit);
    if (slot < 0) return;
    this.nextSlot = (slot + 1) % limit;
    const wave = this.pool[slot];
    wave.x = x;
    wave.y = y;
    wave.ageMs = 0;
    wave.active = true;
  }

  update(deltaMs: number, pipeline: CrtPipeline | null): void {
    const limit = this.qualityBudget().shockwaves;
    for (let i = 0; i < this.pool.length; i++) {
      const wave = this.pool[i];
      if (i >= limit) wave.active = false;
      if (wave.active) {
        wave.ageMs += deltaMs;
        if (wave.ageMs >= SHOCKWAVE_DURATION_MS) wave.active = false;
      }

      const screen = this.coordinates.worldToScreen(worldPoint(wave.x, wave.y));
      this.originsXY[i * 2] = screen.x;
      this.originsXY[i * 2 + 1] = screen.y;
      if (wave.active) {
        const t = wave.ageMs / SHOCKWAVE_DURATION_MS;
        const radiusPoint = this.coordinates.worldToScreen(
          worldPoint(wave.x + SHOCKWAVE_FINAL_RADIUS_PX, wave.y),
        );
        const screenRadius = Math.hypot(radiusPoint.x - screen.x, radiusPoint.y - screen.y);
        this.radii[i] = screenRadius * easeOutCubic(t);
        this.strengths[i] = SHOCKWAVE_PEAK_STRENGTH_PX * (1 - t);
      } else {
        this.radii[i] = 0;
        this.strengths[i] = 0;
      }
    }
    pipeline?.setShockwaves(this.originsXY, this.radii, this.strengths);
  }
}

function easeOutCubic(t: number): number {
  const u = 1 - t;
  return 1 - u * u * u;
}
