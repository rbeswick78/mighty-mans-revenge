import { CrtPipeline, MAX_SHOCKWAVES } from './crt-pipeline.js';

/**
 * CPU-side lifecycle for shockwaves; pairs with `CrtPipeline`'s shader-side
 * displacement uniforms. Each `trigger(x, y)` registers a new ring; each
 * `update(deltaMs)` ages all active rings, computes the current radius +
 * strength, and pushes the packed uniform arrays into the pipeline.
 *
 * Active count is capped at `MAX_SHOCKWAVES` (4). Past the cap, the oldest
 * active ring is recycled (FIFO) so the most recent detonation always
 * gets a slot.
 *
 * The displaced UV reads back the same scene texture, so a shockwave
 * pushes pixels outward from its origin in a brief expanding ring. This
 * is the radial-distortion variant of the effect; nothing here paints
 * pixels of its own.
 */

// --- Tunables ---------------------------------------------------------------

const SHOCKWAVE_DURATION_MS = 350;
// Final ring radius in pixels at end of life. Roughly 4 tiles at TILE_SIZE = 48
// — visible across a meaningful chunk of the playfield without dominating it.
const SHOCKWAVE_FINAL_RADIUS_PX = 192;
// Peak radial displacement amplitude (pixels). Pixels at the ring's centerline
// are pushed outward by this much at t=0; the strength fades linearly with t.
const SHOCKWAVE_PEAK_STRENGTH_PX = 12;

// --- Types ------------------------------------------------------------------

interface Shockwave {
  x: number;
  y: number;
  ageMs: number;
  active: boolean;
}

// --- Class ------------------------------------------------------------------

export class ShockwaveController {
  private readonly pool: Shockwave[] = [];
  // Uniform staging buffers. Refilled in-place every `update()`; pushed
  // into the pipeline by reference. Size matches MAX_SHOCKWAVES.
  private readonly originsXY: Float32Array = new Float32Array(MAX_SHOCKWAVES * 2);
  private readonly radii: Float32Array = new Float32Array(MAX_SHOCKWAVES);
  private readonly strengths: Float32Array = new Float32Array(MAX_SHOCKWAVES);
  // FIFO recycle pointer when all slots are active.
  private nextSlot = 0;

  constructor() {
    for (let i = 0; i < MAX_SHOCKWAVES; i++) {
      this.pool.push({ x: 0, y: 0, ageMs: 0, active: false });
    }
  }

  /** Register a new shockwave at world (= screen) coordinates. */
  trigger(x: number, y: number): void {
    const slot = this.acquireSlot();
    const wave = this.pool[slot];
    wave.x = x;
    wave.y = y;
    wave.ageMs = 0;
    wave.active = true;
  }

  /**
   * Age every active wave by `deltaMs`, pack uniform buffers, push into
   * the pipeline. Inactive slots get strength = 0 so the shader's loop
   * skips their displacement contribution arithmetically (no branch).
   */
  update(deltaMs: number, pipeline: CrtPipeline | null): void {
    for (let i = 0; i < this.pool.length; i++) {
      const w = this.pool[i];
      if (w.active) {
        w.ageMs += deltaMs;
        if (w.ageMs >= SHOCKWAVE_DURATION_MS) {
          w.active = false;
        }
      }

      this.originsXY[i * 2] = w.x;
      this.originsXY[i * 2 + 1] = w.y;
      if (w.active) {
        const t = w.ageMs / SHOCKWAVE_DURATION_MS;
        // Radius eases out — fast initial expansion, slowing as it grows.
        this.radii[i] = SHOCKWAVE_FINAL_RADIUS_PX * easeOutCubic(t);
        // Strength fades linearly so the ring weakens as it expands.
        this.strengths[i] = SHOCKWAVE_PEAK_STRENGTH_PX * (1 - t);
      } else {
        this.radii[i] = 0;
        this.strengths[i] = 0;
      }
    }

    pipeline?.setShockwaves(this.originsXY, this.radii, this.strengths);
  }

  /**
   * Find a free slot, or recycle the oldest active slot when the pool is
   * full. With FIFO recycling the most recent trigger always gets a slot;
   * the cost is dropping a still-living older wave.
   */
  private acquireSlot(): number {
    for (let i = 0; i < this.pool.length; i++) {
      const idx = (this.nextSlot + i) % this.pool.length;
      if (!this.pool[idx].active) {
        this.nextSlot = (idx + 1) % this.pool.length;
        return idx;
      }
    }
    const idx = this.nextSlot;
    this.nextSlot = (idx + 1) % this.pool.length;
    return idx;
  }
}

// --- Helpers ----------------------------------------------------------------

function easeOutCubic(t: number): number {
  const u = 1 - t;
  return 1 - u * u * u;
}
