import Phaser from 'phaser';

/**
 * Explosion debris particles. A radial burst of pooled `Phaser.GameObjects.Image`
 * chunks tumbling outward from each detonation. Replaces the per-explosion
 * `Phaser.GameObjects.Particles.ParticleEmitter` previously used by
 * `EffectsRenderer.showExplosion` — that path created and destroyed an
 * emitter per call, which churned objects and was the main per-explosion
 * allocation source.
 *
 * One pool, mixed tints. Hot tints (orange/yellow/red) give the impression
 * of glowing embers; cold tints (dirt/wall) read as kicked rubble. After
 * construction the hot path makes zero per-frame allocations.
 *
 * Positioned at depth `EXPLOSION_FX_DEPTH = 30` (same band as `ImpactFx`)
 * — above players, below the lighting overlay so ambient still tints them.
 */

// --- Tunables ---------------------------------------------------------------

const EXPLOSION_FX_DEPTH = 30;

const DEBRIS_TEXTURE_KEY = 'explosion-debris';
const DEBRIS_TEXTURE_SIZE_PX = 3;

// Pool cap. A typical 1v1 has at most a couple of grenades airborne; each
// burst spawns ~16 chunks. Cap at 96 with FIFO recycling on overflow.
const MAX_DEBRIS = 96;
const DEBRIS_PER_EXPLOSION = 16;

const DEBRIS_LIFE_MIN_MS = 500;
const DEBRIS_LIFE_MAX_MS = 900;
const DEBRIS_SPEED_MIN = 80;
const DEBRIS_SPEED_MAX = 220;
// Slower drag than sparks so debris travels further before settling.
const DEBRIS_DRAG_PER_S = 2.2;
// Per-particle rotation speed range, radians/sec. Random sign per chunk.
const DEBRIS_ROTATION_SPEED_MAX = Math.PI * 4;
const DEBRIS_SCALE_MIN = 1.0;
const DEBRIS_SCALE_MAX = 1.7;

// Mixed warm + cold palette. Warm chunks read as hot embers, cold ones as
// kicked rubble. All from RESURRECT_64.
const DEBRIS_TINTS: readonly number[] = [
  0xf57d4a, // hot orange
  0xf9c22b, // hot yellow
  0xea4f36, // hot red
  0x4c3e24, // dirt
  0x694f62, // wall
  0x3e3546, // shadow
];

// --- Types ------------------------------------------------------------------

interface Debris {
  img: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  rotationSpeed: number;
  ageMs: number;
  lifeMs: number;
  active: boolean;
}

// --- Class ------------------------------------------------------------------

export class ExplosionFx {
  private readonly scene: Phaser.Scene;
  private readonly pool: Debris[] = [];
  private nextSlot = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    bakeDebrisTexture(scene, DEBRIS_TEXTURE_KEY, DEBRIS_TEXTURE_SIZE_PX);

    for (let i = 0; i < MAX_DEBRIS; i++) {
      const img = scene.add.image(0, 0, DEBRIS_TEXTURE_KEY);
      img.setDepth(EXPLOSION_FX_DEPTH);
      img.setVisible(false);
      img.setActive(false);
      this.pool.push({
        img,
        vx: 0,
        vy: 0,
        rotationSpeed: 0,
        ageMs: 0,
        lifeMs: 0,
        active: false,
      });
    }
  }

  /** Emit a radial debris burst at a detonation point. */
  spawnExplosion(x: number, y: number): void {
    for (let i = 0; i < DEBRIS_PER_EXPLOSION; i++) {
      this.spawnDebris(x, y);
    }
  }

  update(deltaMs: number): void {
    if (deltaMs <= 0) return;
    const dt = deltaMs / 1000;
    const drag = Math.exp(-DEBRIS_DRAG_PER_S * dt);

    for (let i = 0; i < this.pool.length; i++) {
      const d = this.pool[i];
      if (!d.active) continue;
      d.ageMs += deltaMs;
      if (d.ageMs >= d.lifeMs) {
        deactivate(d);
        continue;
      }
      d.vx *= drag;
      d.vy *= drag;
      const x = d.img.x + d.vx * dt;
      const y = d.img.y + d.vy * dt;
      d.img.setPosition(x, y);
      d.img.setRotation(d.img.rotation + d.rotationSpeed * dt);
      d.img.setAlpha(1 - d.ageMs / d.lifeMs);
    }
  }

  destroy(): void {
    for (const d of this.pool) d.img.destroy();
    this.pool.length = 0;
    if (this.scene.textures.exists(DEBRIS_TEXTURE_KEY)) {
      this.scene.textures.remove(DEBRIS_TEXTURE_KEY);
    }
  }

  private spawnDebris(x: number, y: number): void {
    const slot = acquireSlot(this.pool, this.nextSlot);
    if (slot === -1) return;
    this.nextSlot = (slot + 1) % this.pool.length;
    const d = this.pool[slot];

    const angle = Math.random() * Math.PI * 2;
    const speed = DEBRIS_SPEED_MIN + Math.random() * (DEBRIS_SPEED_MAX - DEBRIS_SPEED_MIN);
    d.vx = Math.cos(angle) * speed;
    d.vy = Math.sin(angle) * speed;
    d.rotationSpeed = (Math.random() * 2 - 1) * DEBRIS_ROTATION_SPEED_MAX;
    d.ageMs = 0;
    d.lifeMs = DEBRIS_LIFE_MIN_MS + Math.random() * (DEBRIS_LIFE_MAX_MS - DEBRIS_LIFE_MIN_MS);
    d.active = true;

    const scale = DEBRIS_SCALE_MIN + Math.random() * (DEBRIS_SCALE_MAX - DEBRIS_SCALE_MIN);
    d.img.setActive(true);
    d.img.setVisible(true);
    d.img.setPosition(x, y);
    d.img.setRotation(Math.random() * Math.PI * 2);
    d.img.setScale(scale);
    d.img.setAlpha(1);
    d.img.setTint(DEBRIS_TINTS[Math.floor(Math.random() * DEBRIS_TINTS.length)]);
  }
}

// --- Helpers ----------------------------------------------------------------

function deactivate(d: Debris): void {
  d.active = false;
  d.img.setVisible(false);
  d.img.setActive(false);
}

/**
 * Find a slot for a new particle: first inactive starting from `start`, or
 * the slot at `start` itself if the pool is full (FIFO recycling). Returns
 * -1 only for an empty pool.
 */
function acquireSlot(pool: Debris[], start: number): number {
  if (pool.length === 0) return -1;
  for (let i = 0; i < pool.length; i++) {
    const idx = (start + i) % pool.length;
    if (!pool[idx].active) return idx;
  }
  return start;
}

function bakeDebrisTexture(scene: Phaser.Scene, key: string, size: number): void {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0xffffff, 1);
  g.fillRect(0, 0, size, size);
  g.generateTexture(key, size, size);
  g.destroy();
}
